"""
OCR provider abstraction.

Swap the default Google Cloud Vision implementation for Azure Read API or
a vision-capable LLM (Claude/GPT-4o/Gemini) by implementing this interface
and updating `get_ocr_provider()` in factory.py — no other code needs to
change.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class OCRResult:
    text: str
    confidence: float | None = None  # 0.0-1.0 when the provider exposes one


class OCRError(RuntimeError):
    """Raised when the OCR provider fails to process the image."""


class OCRProvider(ABC):
    @abstractmethod
    def extract_text(self, file_bytes: bytes, content_type: str) -> OCRResult:
        """
        Run OCR on raw file bytes and return the extracted text.

        `content_type` is the uploaded file's MIME type (e.g. "image/png" or
        "application/pdf") so providers that need different handling per
        format (like Vision's separate image vs. PDF endpoints) can branch.
        """
        raise NotImplementedError
