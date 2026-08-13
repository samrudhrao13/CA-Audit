# HandScribe

Converts handwritten documents (photos or PDFs) into structured, editable,
copyable digital text — with fields you define yourself, no coding required.
Built for things like Indian GST tax invoices, but the field builder works
for any handwritten form.

**Pipeline:** image/PDF → Google Cloud Vision OCR → raw text + your field
schema → an LLM (Groq, Gemini, or Vertex AI — swappable) → structured,
validated JSON → editable review table → CSV/Excel export.

**New here?** See [SETUP.md](SETUP.md) for everything needed to get this
running on a fresh computer, start to finish.

## Repo layout

```
backend/    FastAPI app (OCR + LLM structuring + templates + history)
frontend/   Next.js 14 app (field builder, upload, review, batch, export)
```

Each has its own README with deeper setup/deployment detail:
[backend/README.md](backend/README.md) · [frontend/README.md](frontend/README.md)

## Quick start (local dev)

**Backend:**
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
copy .env.example .env        # then fill in your API keys — see SETUP.md
uvicorn app.main:app --reload --port 8000
```

**Frontend** (separate terminal):
```bash
cd frontend
npm install
copy .env.example .env.local
npm run dev
```

Open http://localhost:3000.

## What it does

1. **Choose fields** — name, type (Numeric, Alphabetic, Alphanumeric, Date,
   Currency, Email, Phone, GST Number, or Custom Regex), and whether it's
   required. Save a set of fields as a reusable named template.
2. **Verify specific data (optional)** — separately from the fields above,
   check whether a value you already know (e.g. a specific buyer's GSTIN)
   actually appears anywhere in the document, with fuzzy matching that
   tolerates the kind of character misreads handwriting OCR produces.
3. **Upload** — one image/PDF, or up to 50 at once (batch mode processes
   them concurrently and gives one combined results table + export).
4. **Extract** — OCR runs, then the LLM maps the raw text onto your fields.
   Values are never invented — anything not clearly present is left blank
   and flagged, not guessed.
5. **Review & export** — every value is inline-editable. Export to CSV or
   to Excel (which highlights fields needing a second look in orange, and
   — in batch mode — duplicate invoice numbers across the batch in red).

## Reliability features worth knowing about

This isn't just "send OCR text to an LLM and hope" — several deterministic
checks sit on top of the LLM output, because LLMs alone weren't reliable
enough for some of this:

- **Type validation isn't the LLM's opinion.** Every non-empty value is
  re-checked against a real regex for its declared type (including a
  15-character Indian GSTIN pattern) — this is what actually drives the
  Valid/Check badges, not the model's own judgment call.
- **Grand Total is always flagged for manual check**, never auto-marked
  valid — the displayed value is exactly what was on the document, with a
  background calculation (Taxable Value + tax) compared against it so you
  know whether it matches before you trust it.
- **Amount in Words is computed**, not read from handwriting — spelled out
  in the Indian numbering system (Lakh/Crore) from the (corrected) Grand
  Total, since OCR is especially unreliable on handwritten spelled-out
  numbers.
- **Invoice Number has a regex fallback** for when the LLM misses a bare
  "No." label (very common on Indian invoice books) — including cases
  where OCR displaces the value onto a different line than its label.

## Configuration

The LLM structuring step supports three interchangeable providers — pick
one via `LLM_PROVIDER` in `backend/.env`:

| Provider | Auth | Notes |
|---|---|---|
| `groq` | API key | Fast, but free-tier rate limits are easy to hit with real use |
| `gemini` | API key | Google AI Studio — simplest to set up, generous free tier |
| `vertex` | Service account (GCP) | Heaviest setup; only worth it if you need enterprise GCP billing |

Full details on getting each key, plus every other required setting, are
in [SETUP.md](SETUP.md).

## Extending

- **Swap the OCR provider**: implement `OCRProvider` in `backend/app/ocr/`
  and register it in `backend/app/ocr/factory.py`.
- **Add an LLM provider**: implement `LLMStructuringProvider` in
  `backend/app/llm/` and register it in `backend/app/llm/factory.py` — all
  prompt-building and JSON parsing is shared, you only implement the API call.
- **Move to PostgreSQL**: change `DATABASE_URL` in `backend/.env` — the
  SQLAlchemy models are already database-agnostic.

## Deployment

- **Frontend → Vercel**: see [frontend/README.md](frontend/README.md#deployment-vercel)
- **Backend → Railway**: see [backend/README.md](backend/README.md#deployment-railway)
