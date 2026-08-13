"""
Startup configuration and environment validation.

Fails fast and loudly if required env vars are missing or invalid, rather
than letting a request handler blow up deep in the call stack later.
"""
import os
import sys

from dotenv import load_dotenv

load_dotenv()


class ConfigError(RuntimeError):
    pass


def _require(name: str) -> str:
    value = os.getenv(name)
    if not value or not value.strip():
        raise ConfigError(
            f"Missing required environment variable '{name}'. "
            f"Copy backend/.env.example to backend/.env and fill it in."
        )
    return value.strip()


class Settings:
    def __init__(self) -> None:
        self.llm_provider: str = os.getenv("LLM_PROVIDER", "groq").strip().lower()
        if self.llm_provider not in ("groq", "gemini", "vertex"):
            raise ConfigError(
                f"Unknown LLM_PROVIDER '{self.llm_provider}'. Supported: groq, gemini, vertex."
            )

        # All provider settings are read (not required) regardless of which
        # one is active, so switching LLM_PROVIDER doesn't require re-adding
        # the others later — only the currently-selected provider's settings
        # are actually enforced at startup.
        self.groq_api_key: str | None = os.getenv("GROQ_API_KEY")
        self.groq_model: str = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
        # Groq's tokens-per-minute limit varies significantly by account,
        # and this counts against it up front — keep it just big enough for
        # the model in use (see GROQ_MODEL comment in .env.example).
        self.groq_max_completion_tokens: int = int(
            os.getenv("GROQ_MAX_COMPLETION_TOKENS", "4096")
        )
        self.gemini_api_key: str | None = os.getenv("GEMINI_API_KEY")
        self.gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-flash-latest")
        self.vertex_project_id: str | None = os.getenv("GOOGLE_VERTEX_PROJECT_ID")
        self.vertex_location: str = os.getenv("GOOGLE_VERTEX_LOCATION", "us-central1")
        self.vertex_model: str = os.getenv("GOOGLE_VERTEX_MODEL", "gemini-2.0-flash-001")
        self.google_application_credentials: str | None = os.getenv(
            "GOOGLE_APPLICATION_CREDENTIALS"
        )

        if self.llm_provider == "groq" and not self.groq_api_key:
            raise ConfigError(
                "LLM_PROVIDER=groq requires GROQ_API_KEY to be set in backend/.env."
            )
        if self.llm_provider == "gemini" and not self.gemini_api_key:
            raise ConfigError(
                "LLM_PROVIDER=gemini requires GEMINI_API_KEY to be set in backend/.env "
                "(get one from https://aistudio.google.com/apikey)."
            )
        if self.llm_provider == "vertex":
            if not self.vertex_project_id:
                raise ConfigError(
                    "LLM_PROVIDER=vertex requires GOOGLE_VERTEX_PROJECT_ID to be set "
                    "in backend/.env."
                )
            if not self.google_application_credentials:
                raise ConfigError(
                    "LLM_PROVIDER=vertex requires GOOGLE_APPLICATION_CREDENTIALS to point "
                    "at a Vertex AI service account JSON key file."
                )
            if not os.path.isfile(self.google_application_credentials):
                raise ConfigError(
                    "GOOGLE_APPLICATION_CREDENTIALS points to "
                    f"'{self.google_application_credentials}', but no file exists there."
                )

        self.google_vision_api_key: str = _require("GOOGLE_VISION_API_KEY")

        self.database_url: str = os.getenv("DATABASE_URL", "sqlite:///./handscribe.db")
        self.cors_origins: list[str] = [
            origin.strip()
            for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
            if origin.strip()
        ]
        self.ocr_provider: str = os.getenv("OCR_PROVIDER", "google_vision")
        self.max_upload_mb: int = int(os.getenv("MAX_UPLOAD_MB", "10"))


def load_settings() -> Settings:
    try:
        return Settings()
    except ConfigError as exc:
        sys.stderr.write(f"\n[HandScribe backend] Startup configuration error:\n  {exc}\n\n")
        raise SystemExit(1) from exc


settings = load_settings()
