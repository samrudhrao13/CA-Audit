"""Selects the active LLMStructuringProvider implementation based on LLM_PROVIDER."""
from functools import lru_cache

from app.config import settings
from app.llm.base import LLMStructuringProvider


@lru_cache(maxsize=1)
def get_llm_provider() -> LLMStructuringProvider:
    if settings.llm_provider == "groq":
        from app.llm.groq_client import GroqStructuringClient

        return GroqStructuringClient()

    if settings.llm_provider == "gemini":
        from app.llm.gemini_client import GeminiStructuringClient

        return GeminiStructuringClient()

    if settings.llm_provider == "vertex":
        from app.llm.vertex_client import VertexStructuringClient

        return VertexStructuringClient()

    raise ValueError(
        f"Unknown LLM_PROVIDER '{settings.llm_provider}'. "
        "Supported: groq, gemini, vertex (add new providers in app/llm/)."
    )
