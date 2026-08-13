# HandScribe backend (FastAPI)

Converts a handwritten document image into structured field data:
Google Cloud Vision OCR → LLM structuring/validation (Groq or Gemini) → editable JSON.

## Setup

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS/Linux

pip install -r requirements.txt
```

1. Copy `.env.example` to `.env` and fill in the values.
2. Get a Google Cloud Vision API key: Cloud Console > APIs & Services >
   Credentials > Create Credentials > API Key, then restrict it to the
   Cloud Vision API. **The project it belongs to must have billing enabled**
   — Vision API requires this even within the free tier (1,000 units/month
   free). Set it as `GOOGLE_VISION_API_KEY`.
3. Pick an LLM structuring provider via `LLM_PROVIDER` (`groq`, `gemini`,
   or `vertex`) and set the matching settings:
   - `groq`: get a key from https://console.groq.com/keys, set `GROQ_API_KEY`.
   - `gemini`: get a key from https://aistudio.google.com/apikey (Google AI
     Studio — a plain API key, not full Vertex AI), set `GEMINI_API_KEY`.
   - `vertex`: the full GCP path — create/select a project, enable the
     Vertex AI API, link billing, create a service account with the
     "Vertex AI User" role, download its JSON key. Set
     `GOOGLE_VERTEX_PROJECT_ID`, `GOOGLE_VERTEX_LOCATION` (default
     `us-central1`), and point `GOOGLE_APPLICATION_CREDENTIALS` at the
     downloaded JSON (keep it out of git — e.g. `backend/secrets/`, which
     is gitignored).

The app validates the Vision key and whichever LLM key is active at startup,
refusing to boot with a clear error message if either is missing — this is
intentional so misconfiguration never fails silently mid-request.

## Run

```bash
uvicorn app.main:app --reload --port 8000
```

API docs (Swagger UI) at http://localhost:8000/docs.

## Endpoints

- `POST /api/templates` — create a field template
- `GET /api/templates` — list templates
- `PUT /api/templates/{id}` — update a template
- `DELETE /api/templates/{id}` — delete a template
- `POST /api/extract` — multipart form: `image` file (JPG/PNG/WEBP/PDF) +
  either `template_id` or `fields_json` (JSON string: `{"fields": [...]}`)
  + optional `verifications_json` (JSON string: `{"verifications": [{"label":
  "Buyer GSTIN", "value": "27AAPFU0939F1ZV"}, ...]}`) — runs OCR then LLM
  structuring, returns structured JSON. Verifications are a separate,
  ad-hoc presence check (not tied to the field schema or saved templates):
  each one just reports whether that exact value was found anywhere in the
  document text, for confirming a value you already know (e.g. "is this
  specific buyer GSTIN on this invoice?") rather than extracting whatever
  happens to be there. PDFs are processed via Vision's synchronous
  `files:annotate` endpoint, which is capped at the first 5 pages.
- `GET /api/history` — list past extractions
- `GET /api/health` — health check

## Architecture notes

- **OCR provider abstraction**: `app/ocr/base.py` defines `OCRProvider`.
  `app/ocr/google_vision.py` is the default implementation — it calls the
  Vision REST API directly with an API key (`GOOGLE_VISION_API_KEY`) rather
  than the `google-cloud-vision` SDK, since the SDK is built around
  service-account/ADC auth. To swap in Azure Read API, a service-account-based
  Vision setup, or a vision LLM, implement the same interface and register it
  in `app/ocr/factory.py` — nothing else needs to change.
- **Database**: SQLAlchemy models in `app/models.py`, using SQLite locally
  via `DATABASE_URL`. Switching to PostgreSQL (e.g. on Railway) only
  requires changing that connection string.
- **LLM provider abstraction**: `app/llm/base.py` defines
  `LLMStructuringProvider` with all the shared prompt-building, JSON
  parsing, and field-validation logic; `app/llm/groq_client.py`,
  `app/llm/gemini_client.py`, and `app/llm/vertex_client.py` each just
  implement the actual API call (Groq/Gemini via a plain API key, Vertex
  via service-account OAuth). Switch providers via `LLM_PROVIDER` in
  `.env` — `app/llm/factory.py` picks the implementation. Parsing strips
  any `<think>...</think>` reasoning-wrapper tags and markdown code
  fences before parsing JSON, and raises a clear `LLMStructuringError`
  (surfaced to the frontend as a 502 with a message) rather than letting
  a raw stack trace through. The Groq client sets a generous
  `max_completion_tokens` and checks `finish_reason` — "thinking" models
  can spend thousands of tokens reasoning before reaching the JSON, and a
  too-low limit truncates mid-thought and silently breaks parsing.
- **Validity flags aren't just the LLM's opinion**: `app/utils/type_validation.py`
  re-checks every non-empty extracted value against a deterministic regex
  for its declared type (including `gst_number`, a 15-character Indian
  GSTIN pattern) and overrides the LLM's own valid/invalid judgment. This
  is what the "Valid"/"Check" badges in the UI are actually based on.

## Deployment (Railway)

1. Create a new Railway project, deploy from this `backend/` directory
   (set the root directory to `backend` if deploying the whole monorepo).
2. Set the start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
3. Add environment variables in Railway's dashboard: `GOOGLE_VISION_API_KEY`,
   `LLM_PROVIDER`, plus whichever LLM provider's settings match it
   (`GROQ_API_KEY`/`GROQ_MODEL`, `GEMINI_API_KEY`/`GEMINI_MODEL`, or
   `GOOGLE_VERTEX_PROJECT_ID`/`GOOGLE_VERTEX_LOCATION`), `OCR_PROVIDER`,
   `DATABASE_URL` (point at a Railway Postgres plugin for production),
   `CORS_ORIGINS` (your Vercel frontend URL). If using `vertex`, Railway
   doesn't support uploading a file directly — store the service account
   JSON contents in an env var and write it to a temp file on startup,
   then point `GOOGLE_APPLICATION_CREDENTIALS` at that path.
