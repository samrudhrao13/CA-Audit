"""Groq implementation of LLMStructuringProvider."""
from groq import Groq

from app.config import settings
from app.llm.base import LLMStructuringError, LLMStructuringProvider


class GroqStructuringClient(LLMStructuringProvider):
    def __init__(self) -> None:
        self._client = Groq(api_key=settings.groq_api_key)

    def _call_model(self, system: str, prompt: str) -> str:
        try:
            completion = self._client.chat.completions.create(
                model=settings.groq_model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt},
                ],
                temperature=0,
                # Groq counts the requested max toward the account's
                # tokens-per-minute limit up front (not just actual usage),
                # and that limit varies a lot by account — so this needs to
                # be just big enough for the model in use, not maximal.
                # llama-3.3-70b-versatile reasons concisely; verbose
                # "thinking" models (e.g. qwen3) need much more headroom.
                max_completion_tokens=settings.groq_max_completion_tokens,
            )
        except Exception as exc:
            raise LLMStructuringError(f"Groq API request failed: {exc}") from exc

        finish_reason = completion.choices[0].finish_reason
        if finish_reason == "length":
            raise LLMStructuringError(
                "Groq response was cut off before completing (hit the token limit) — "
                "try again or reduce the number of fields."
            )

        return completion.choices[0].message.content or ""
