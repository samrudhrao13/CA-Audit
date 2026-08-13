"""Selects the active OCRProvider implementation based on OCR_PROVIDER."""
from functools import lru_cache

from app.config import settings
from app.ocr.base import OCRProvider


@lru_cache(maxsize=1)
def get_ocr_provider() -> OCRProvider:
    if settings.ocr_provider == "google_vision":
        from app.ocr.google_vision import GoogleVisionOCRProvider

        return GoogleVisionOCRProvider()

    raise ValueError(
        f"Unknown OCR_PROVIDER '{settings.ocr_provider}'. "
        "Supported: google_vision (add new providers in app/ocr/)."
    )
