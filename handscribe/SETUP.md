# Setup guide: running HandScribe on a new computer

Everything needed to go from a fresh machine to a running app, including
the real gotchas hit while building this.

## 1. Prerequisites

- **Python 3.10+** (check: `python --version`)
- **Node.js 18+** and npm (check: `node --version`)
- **Git**
- A **Google Cloud** account (for OCR — required, no way around this one)
- One LLM provider account: **Groq** or **Gemini** (pick one — see §4)

## 2. Clone the repo

```bash
git clone https://github.com/Lucifer-cyber007/handscribe.git
cd handscribe
```

## 3. Google Cloud Vision (OCR) — required

This powers reading the handwriting itself; there's no way to run the app
without it.

1. Go to [Google Cloud Console](https://console.cloud.google.com/) →
   create or select a project.
2. **APIs & Services → Credentials → Create Credentials → API Key.**
   Restrict it to the Cloud Vision API (recommended, not required).
3. **Enable billing on that project.** This is the step people miss — the
   Vision API requires a billing account linked even to use its free tier
   (1,000 units/month free, then pay-per-use). Without this, every OCR
   call fails with a `BILLING_DISABLED` error regardless of how correct
   your API key is.
4. Save the key — you'll put it in `backend/.env` as `GOOGLE_VISION_API_KEY`.

## 4. Pick an LLM provider — required

The LLM turns raw OCR text into your structured fields. Three options exist;
**Gemini is the easiest to get working** based on direct experience setting
all three up:

### Option A — Gemini (recommended for getting started)

1. Go to **https://aistudio.google.com/apikey**
2. Sign in, click **"Create API key" → "Create API key in new project"**
   (a *new* project, not one you've used before — see the note on
   prepay billing below)
3. Copy the key (starts with `AIzaSy...`)
4. In `backend/.env`: `LLM_PROVIDER=gemini`, `GEMINI_API_KEY=<your key>`

**Model name matters and goes stale.** Don't hardcode a specific dated
version like `gemini-2.0-flash` — Google supersedes these within months.
Use `GEMINI_MODEL=gemini-flash-latest` (an alias that always points to
Google's current recommended flash model) unless you specifically need a
pinned, reproducible version.

**If you see "prepayment credits are depleted":** that's a paid-project
billing state, not a rate limit. Either link/top up billing on that
project at https://ai.studio/projects, or just generate a key from a
*different*, fresh AI Studio project — a new project typically starts on
the standard free tier without needing prepay at all.

### Option B — Groq (faster, but free tier is easy to exhaust)

1. Go to **https://console.groq.com/keys**, sign in, create a key
   (starts with `gsk_...`)
2. In `backend/.env`: `LLM_PROVIDER=groq`, `GROQ_API_KEY=<your key>`

**Known limitation, confirmed through real use:** Groq's free tier caps
out at 100,000 tokens/day and ~12,000 tokens/minute *per organization* —
and creating a "new" free account does **not** reliably reset this, since
Groq's abuse-prevention appears to tie new signups back to the same
underlying organization (confirmed: two "different" keys from two
supposedly separate signups showed the identical `org_...` ID in their
rate-limit errors). If you hit this wall repeatedly, either upgrade to
Groq's paid Dev Tier (console.groq.com/settings/billing) or switch to
Gemini instead.

Also: if you ever see a `413 Request too large... TPM` error, lower
`GROQ_MAX_COMPLETION_TOKENS` in `.env` (default `4096`) — Groq reserves
that many tokens against your per-minute budget up front, before
generation even starts, and that budget varies a lot by account.

### Option C — Vertex AI (only if you specifically need enterprise GCP)

Significantly more setup for no accuracy benefit over Gemini's plain API
— only worth it if your organization requires GCP-native billing/IAM.
See `backend/README.md` for the full service-account setup steps if
you need this path.

## 5. Backend setup

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS/Linux
pip install -r requirements.txt
```

Copy `.env.example` to `.env` and fill in:
- `GOOGLE_VISION_API_KEY` (from §3)
- `LLM_PROVIDER` + matching key (from §4)
- Everything else has a sensible default — leave as-is unless you know
  you need to change it

Run it:
```bash
uvicorn app.main:app --reload --port 8000
```

Check it's alive: open http://localhost:8000/api/health — should return
`{"status":"ok"}`. If it exits immediately with a config error instead,
the error message tells you exactly which env var is missing — the app
is designed to fail loudly at startup rather than break mid-request.

## 6. Frontend setup

```bash
cd frontend
npm install
```

Copy `.env.example` to `.env.local`. The default
`NEXT_PUBLIC_API_BASE_URL=http://localhost:8000` is correct as long as
the backend is running on the default port.

Run it:
```bash
npm run dev
```

Open http://localhost:3000.

## 7. Smoke test

1. On the main page, add a field (e.g. name it "Test", type Alphanumeric)
2. Upload any image with some text in it (typed or handwritten)
3. Click Extract — you should get a result back within a few seconds

If this works, everything's wired up correctly.

## Troubleshooting

**Frontend shows "missing required error components, refreshing..." or a
500 error mentioning `Cannot find module './NNN.js'`:** this is a known
Next.js dev-mode issue — deleting/renaming a file while `npm run dev` is
running can corrupt its build cache. Fix:
```bash
# stop the dev server first (Ctrl+C), then:
rm -rf frontend/.next
npm run dev
```
Wait for "Ready" before reloading the browser tab.

**Backend changes don't seem to take effect:** `uvicorn --reload` watches
`.py` files but **not** `.env`. If you only changed `.env`, restart the
backend process manually rather than relying on auto-reload.

**Extraction fails with a rate-limit / 429 error:** see the provider-
specific notes in §4 above — this is an account-tier limit, not a bug.

**OCR fails with `BILLING_DISABLED`:** you skipped step 3 above — Vision
API requires a linked billing account even for free-tier usage.

## What each field type actually checks

| Type | What it validates |
|---|---|
| Numeric | digits only |
| Alphabetic | letters, spaces, `.`/`'`/`-` |
| Alphanumeric | letters, digits, common punctuation |
| Date | several common date formats |
| Currency | numeric with optional `₹`/`$`/commas/decimals |
| Email | standard email shape |
| Phone | 7–15 digits, common separators |
| GST Number | 15-character Indian GSTIN pattern |
| Custom Regex | whatever pattern you provide |

These are enforced with real regex — not just the LLM's opinion — so the
Valid/Check badges in the review screen are trustworthy.
