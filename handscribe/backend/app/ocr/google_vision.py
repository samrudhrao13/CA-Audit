"""
Google Cloud Vision implementation of OCRProvider (DOCUMENT_TEXT_DETECTION),
authenticated via a simple API key rather than a service account — calls
the REST endpoints directly since the google-cloud-vision SDK is built
around service-account/ADC auth.

Images go through `images:annotate`; PDFs go through the separate
`files:annotate` endpoint, since Vision doesn't accept PDF bytes as an
"image". Synchronous `files:annotate` is capped at 5 pages by the API
itself — longer PDFs only get their first 5 pages processed.
"""
import base64

import requests

from app.config import settings
from app.ocr.base import OCRError, OCRProvider, OCRResult

VISION_IMAGE_ENDPOINT = "https://vision.googleapis.com/v1/images:annotate"
VISION_FILE_ENDPOINT = "https://vision.googleapis.com/v1/files:annotate"

MAX_SYNC_PDF_PAGES = 5


class GoogleVisionOCRProvider(OCRProvider):
    def __init__(self) -> None:
        self._api_key = settings.google_vision_api_key

    def extract_text(self, file_bytes: bytes, content_type: str) -> OCRResult:
        if content_type == "application/pdf":
            return self._extract_from_pdf(file_bytes)
        return self._extract_from_image(file_bytes)

    def _extract_from_image(self, image_bytes: bytes) -> OCRResult:
        payload = {
            "requests": [
                {
                    "image": {"content": base64.b64encode(image_bytes).decode("ascii")},
                    "features": [{"type": "DOCUMENT_TEXT_DETECTION"}],
                }
            ]
        }
        body = self._post(VISION_IMAGE_ENDPOINT, payload)
        result = (body.get("responses") or [{}])[0]
        if "error" in result:
            raise OCRError(f"Google Vision returned an error: {result['error'].get('message')}")

        return self._to_ocr_result([result.get("fullTextAnnotation") or {}])

    def _extract_from_pdf(self, pdf_bytes: bytes) -> OCRResult:
        payload = {
            "requests": [
                {
                    "inputConfig": {
                        "mimeType": "application/pdf",
                        "content": base64.b64encode(pdf_bytes).decode("ascii"),
                    },
                    "features": [{"type": "DOCUMENT_TEXT_DETECTION"}],
                }
            ]
        }
        body = self._post(VISION_FILE_ENDPOINT, payload)
        file_result = (body.get("responses") or [{}])[0]
        if "error" in file_result:
            raise OCRError(
                f"Google Vision returned an error: {file_result['error'].get('message')}"
            )

        page_responses = file_result.get("responses") or []
        if not page_responses:
            raise OCRError("Google Vision returned no pages for this PDF.")

        annotations = [
            page.get("fullTextAnnotation") or {}
            for page in page_responses[:MAX_SYNC_PDF_PAGES]
            if "error" not in page
        ]
        return self._to_ocr_result(annotations)

    def _post(self, endpoint: str, payload: dict) -> dict:
        try:
            response = requests.post(
                endpoint, params={"key": self._api_key}, json=payload, timeout=45
            )
        except requests.RequestException as exc:
            raise OCRError(f"Google Vision request failed: {exc}") from exc

        try:
            body = response.json()
        except ValueError as exc:
            raise OCRError(
                f"Google Vision returned a non-JSON response (status {response.status_code})"
            ) from exc

        if "error" in body:
            raise OCRError(f"Google Vision returned an error: {body['error'].get('message')}")
        if not response.ok:
            raise OCRError(f"Google Vision request failed with status {response.status_code}")
        return body

    @staticmethod
    def _to_ocr_result(annotations: list[dict]) -> OCRResult:
        texts = [a["text"].strip() for a in annotations if a.get("text")]
        full_text = "\n\n".join(texts).strip()

        confidences = [
            page["confidence"]
            for annotation in annotations
            for page in annotation.get("pages") or []
            if "confidence" in page
        ]
        confidence = sum(confidences) / len(confidences) if confidences else None

        return OCRResult(text=full_text, confidence=confidence)
