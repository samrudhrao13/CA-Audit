import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.llm.base import LLMStructuringError
from app.llm.factory import get_llm_provider
from app.models import Extraction, Template
from app.ocr.base import OCRError
from app.ocr.factory import get_ocr_provider
from app.schemas import ExtractionResult, FieldsPayload, VerificationItemIn, VerificationResult
from app.utils.computed_fields import (
    apply_amount_in_words_computation,
    apply_grand_total_check,
)
from app.utils.invoice_number_fallback import apply_invoice_number_fallback
from app.utils.mandatory_field_fallback import apply_mandatory_field_fallback
from app.utils.text_match import is_present_in_text

router = APIRouter(prefix="/api/extract", tags=["extract"])

ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "application/pdf",
}

# Roughly: an OCR result shorter than this, or with very low confidence,
# usually means the photo was blurry/unreadable rather than a genuinely
# sparse document.
MIN_USABLE_TEXT_LENGTH = 3
LOW_CONFIDENCE_THRESHOLD = 0.35


@router.post("", response_model=ExtractionResult)
async def extract(
    image: UploadFile = File(...),
    template_id: str | None = Form(default=None),
    fields_json: str | None = Form(default=None),
    verifications_json: str | None = Form(default=None),
    db: Session = Depends(get_db),
) -> ExtractionResult:
    if image.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            400,
            f"Unsupported file type '{image.content_type}'. Upload a JPG, PNG, WEBP, or PDF file.",
        )

    file_bytes = await image.read()
    if not file_bytes:
        raise HTTPException(400, "Uploaded file was empty.")
    if len(file_bytes) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(
            400, f"File exceeds the {settings.max_upload_mb}MB upload limit."
        )

    template: Template | None = None
    if template_id:
        template = db.get(Template, template_id)
        if not template:
            raise HTTPException(404, "Template not found.")
        field_defs = [
            {
                "name": f.name,
                "field_type": f.field_type,
                "regex_pattern": f.regex_pattern,
                "required": f.required,
            }
            for f in template.fields
        ]
    elif fields_json:
        try:
            raw = json.loads(fields_json)
        except json.JSONDecodeError as exc:
            raise HTTPException(400, f"fields_json was not valid JSON: {exc}") from exc
        field_defs = raw.get("fields", raw) if isinstance(raw, dict) else raw
    else:
        raise HTTPException(
            400, "Provide either template_id or fields_json describing the fields to extract."
        )

    try:
        payload = FieldsPayload.model_validate({"fields": field_defs})
    except ValidationError as exc:
        raise HTTPException(422, f"Invalid field schema: {exc.errors()}") from exc

    verification_items: list[VerificationItemIn] = []
    if verifications_json:
        try:
            raw_verifications = json.loads(verifications_json)
        except json.JSONDecodeError as exc:
            raise HTTPException(400, f"verifications_json was not valid JSON: {exc}") from exc
        items = (
            raw_verifications.get("verifications", raw_verifications)
            if isinstance(raw_verifications, dict)
            else raw_verifications
        )
        try:
            verification_items = [VerificationItemIn.model_validate(item) for item in items]
        except ValidationError as exc:
            raise HTTPException(422, f"Invalid verification data: {exc.errors()}") from exc

    # --- OCR ---
    ocr_provider = get_ocr_provider()
    try:
        ocr_result = ocr_provider.extract_text(file_bytes, image.content_type)
    except OCRError as exc:
        raise HTTPException(502, f"OCR provider failed: {exc}") from exc

    text_too_short = len(ocr_result.text.strip()) < MIN_USABLE_TEXT_LENGTH
    low_confidence = (
        ocr_result.confidence is not None and ocr_result.confidence < LOW_CONFIDENCE_THRESHOLD
    )
    if text_too_short or low_confidence:
        message = (
            "Couldn't read this PDF clearly — make sure it contains selectable "
            "or scanned text on the first few pages."
            if image.content_type == "application/pdf"
            else "Couldn't read this image clearly — try retaking the photo with better "
            "lighting and focus, and make sure the handwriting fills the frame."
        )
        raise HTTPException(422, message)

    # --- LLM structuring ---
    llm_provider = get_llm_provider()
    try:
        extracted_fields = llm_provider.structure_fields(ocr_result.text, payload.fields)
    except LLMStructuringError as exc:
        raise HTTPException(
            502, f"Couldn't structure the extracted text into fields: {exc}"
        ) from exc

    apply_invoice_number_fallback(extracted_fields, ocr_result.text)
    apply_mandatory_field_fallback(extracted_fields, ocr_result.text)
    computed_total = apply_grand_total_check(extracted_fields)
    apply_amount_in_words_computation(extracted_fields, computed_total)

    verification_results = []
    for item in verification_items:
        match = is_present_in_text(item.value, ocr_result.text)
        verification_results.append(
            VerificationResult(
                label=item.label,
                value=item.value,
                found=match.found,
                similarity=match.similarity,
                matched_text=match.matched_text,
            )
        )

    extraction = Extraction(
        template_id=template.id if template else None,
        template_name=template.name if template else None,
        raw_ocr_text=ocr_result.text,
        result_json={
            "fields": [f.model_dump() for f in extracted_fields],
            "verifications": [v.model_dump() for v in verification_results],
        },
    )
    db.add(extraction)
    db.commit()
    db.refresh(extraction)

    return ExtractionResult(
        id=extraction.id,
        template_id=extraction.template_id,
        template_name=extraction.template_name,
        created_at=extraction.created_at,
        raw_ocr_text=extraction.raw_ocr_text,
        fields=extracted_fields,
        verifications=verification_results,
    )
