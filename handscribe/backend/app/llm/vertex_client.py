"""
Vertex AI (Gemini) implementation of LLMStructuringProvider.

Unlike the Google AI Studio Gemini API, Vertex AI is authenticated via a
service account rather than a plain API key — this is the standard,
well-supported auth path for Vertex AI's REST API.
"""
import google.auth.transport.requests
import requests
from google.oauth2 import service_account

from app.config import settings
from app.llm.base import LLMStructuringError, LLMStructuringProvider

_SCOPES = ["https://www.googleapis.com/auth/cloud-platform"]


class VertexStructuringClient(LLMStructuringProvider):
    def __init__(self) -> None:
        self._project = settings.vertex_project_id
        self._location = settings.vertex_location
        self._model = settings.vertex_model
        try:
            self._credentials = service_account.Credentials.from_service_account_file(
                settings.google_application_credentials, scopes=_SCOPES
            )
        except (OSError, ValueError) as exc:
            raise LLMStructuringError(
                f"Couldn't load Vertex AI service account credentials from "
                f"'{settings.google_application_credentials}': {exc}"
            ) from exc

    def _get_access_token(self) -> str:
        if not self._credentials.valid:
            self._credentials.refresh(google.auth.transport.requests.Request())
        return self._credentials.token

    def _call_model(self, system: str, prompt: str) -> str:
        url = (
            f"https://{self._location}-aiplatform.googleapis.com/v1/projects/"
            f"{self._project}/locations/{self._location}/publishers/google/"
            f"models/{self._model}:generateContent"
        )
        payload = {
            "system_instruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0},
        }

        try:
            token = self._get_access_token()
        except Exception as exc:
            raise LLMStructuringError(f"Vertex AI authentication failed: {exc}") from exc

        try:
            response = requests.post(
                url,
                headers={"Authorization": f"Bearer {token}"},
                json=payload,
                timeout=45,
            )
        except requests.RequestException as exc:
            raise LLMStructuringError(f"Vertex AI request failed: {exc}") from exc

        try:
            body = response.json()
        except ValueError as exc:
            raise LLMStructuringError(
                f"Vertex AI returned a non-JSON response (status {response.status_code})"
            ) from exc

        if "error" in body:
            raise LLMStructuringError(f"Vertex AI returned an error: {body['error'].get('message')}")
        if not response.ok:
            raise LLMStructuringError(f"Vertex AI request failed with status {response.status_code}")

        try:
            candidate = body["candidates"][0]
            parts = candidate["content"]["parts"]
            return "".join(part.get("text", "") for part in parts)
        except (KeyError, IndexError) as exc:
            finish_reason = body.get("candidates", [{}])[0].get("finishReason")
            raise LLMStructuringError(
                f"Unexpected Vertex AI response shape (finishReason={finish_reason}): {body}"
            ) from exc
