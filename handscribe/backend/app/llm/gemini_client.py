"""Gemini implementation of LLMStructuringProvider (Google AI Studio API key)."""
import requests

from app.config import settings
from app.llm.base import LLMStructuringError, LLMStructuringProvider

GEMINI_ENDPOINT_TEMPLATE = (
    "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
)


class GeminiStructuringClient(LLMStructuringProvider):
    def __init__(self) -> None:
        self._api_key = settings.gemini_api_key
        self._model = settings.gemini_model

    def _call_model(self, system: str, prompt: str) -> str:
        url = GEMINI_ENDPOINT_TEMPLATE.format(model=self._model)
        payload = {
            "system_instruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0},
        }

        try:
            response = requests.post(
                url, params={"key": self._api_key}, json=payload, timeout=45
            )
        except requests.RequestException as exc:
            raise LLMStructuringError(f"Gemini API request failed: {exc}") from exc

        try:
            body = response.json()
        except ValueError as exc:
            raise LLMStructuringError(
                f"Gemini returned a non-JSON response (status {response.status_code})"
            ) from exc

        if "error" in body:
            raise LLMStructuringError(f"Gemini returned an error: {body['error'].get('message')}")
        if not response.ok:
            raise LLMStructuringError(f"Gemini request failed with status {response.status_code}")

        try:
            candidate = body["candidates"][0]
            parts = candidate["content"]["parts"]
            return "".join(part.get("text", "") for part in parts)
        except (KeyError, IndexError) as exc:
            finish_reason = body.get("candidates", [{}])[0].get("finishReason")
            raise LLMStructuringError(
                f"Unexpected Gemini response shape (finishReason={finish_reason}): {body}"
            ) from exc
