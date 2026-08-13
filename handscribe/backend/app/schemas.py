"""Pydantic request/response schemas, including server-side field validation."""
import re
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field, field_validator, model_validator


class FieldType(str, Enum):
    NUMERIC = "numeric"
    ALPHABETIC = "alphabetic"
    ALPHANUMERIC = "alphanumeric"
    DATE = "date"
    CURRENCY = "currency"
    EMAIL = "email"
    PHONE = "phone"
    GST_NUMBER = "gst_number"
    CUSTOM_REGEX = "custom_regex"


class FieldSchemaIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    field_type: FieldType
    regex_pattern: str | None = None
    required: bool = False

    @model_validator(mode="after")
    def validate_regex_present_when_needed(self) -> "FieldSchemaIn":
        if self.field_type == FieldType.CUSTOM_REGEX:
            if not self.regex_pattern or not self.regex_pattern.strip():
                raise ValueError(
                    f"Field '{self.name}' has type custom_regex but no regex_pattern was provided."
                )
            try:
                re.compile(self.regex_pattern)
            except re.error as exc:
                raise ValueError(
                    f"Field '{self.name}' has an invalid regex pattern: {exc}"
                ) from exc
        return self


class FieldSchemaOut(FieldSchemaIn):
    id: str
    position: int

    class Config:
        from_attributes = True


class TemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    fields: list[FieldSchemaIn] = Field(min_length=1)

    @field_validator("fields")
    @classmethod
    def unique_field_names(cls, fields: list[FieldSchemaIn]) -> list[FieldSchemaIn]:
        names = [f.name.strip().lower() for f in fields]
        if len(names) != len(set(names)):
            raise ValueError("Field names within a template must be unique.")
        return fields


class TemplateUpdate(TemplateCreate):
    pass


class FieldsPayload(BaseModel):
    """Ad-hoc field schema sent alongside an /api/extract upload (no template saved)."""

    fields: list[FieldSchemaIn] = Field(min_length=1)

    @field_validator("fields")
    @classmethod
    def unique_field_names(cls, fields: list[FieldSchemaIn]) -> list[FieldSchemaIn]:
        names = [f.name.strip().lower() for f in fields]
        if len(names) != len(set(names)):
            raise ValueError("Field names must be unique.")
        return fields


class TemplateOut(BaseModel):
    id: str
    name: str
    created_at: datetime
    updated_at: datetime
    fields: list[FieldSchemaOut]

    class Config:
        from_attributes = True


class ExtractedField(BaseModel):
    name: str
    value: str
    valid: bool
    required: bool
    field_type: FieldType
    reason: str | None = None


class VerificationItemIn(BaseModel):
    """
    A standalone, ad-hoc value to check for presence in the document —
    independent of the field builder and not saved as part of any template.
    E.g. label="Buyer GSTIN", value="27AAPFU0939F1ZV".
    """

    label: str = Field(min_length=1, max_length=255)
    value: str = Field(min_length=1, max_length=500)


class VerificationResult(BaseModel):
    label: str
    value: str
    found: bool
    # 1.0 = exact match. Below 1.0, this is how close the nearest match in
    # the document text was — handwriting OCR often misreads a character
    # or two, so a near-miss is still reported instead of a flat "not found".
    similarity: float
    matched_text: str | None = None


class ExtractionResult(BaseModel):
    id: str
    template_id: str | None
    template_name: str | None
    created_at: datetime
    raw_ocr_text: str
    fields: list[ExtractedField]
    verifications: list[VerificationResult] = []

    class Config:
        from_attributes = True


class ExtractionHistoryItem(BaseModel):
    id: str
    template_name: str | None
    created_at: datetime
    preview: str

    class Config:
        from_attributes = True
