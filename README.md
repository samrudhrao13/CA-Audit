# Auditor Workflow Platform

An enterprise-provisioned app for auditing firms to manage compliance workflows (GST, TDS) for
their own clients — document collection, filing progress, AI-powered invoice extraction, and
Google Drive storage, all in one place. Accounts are issued top-down (platform admin → company
admin → company users) — nobody signs themselves up. Each company only ever sees its own
clients, users, and data.

## Key features

- **Client management** — full company profiles (GSTIN/PAN/TAN/HSN/CIN, address, contact
  person, TDS applicability), plus free-form custom fields per client.
- **GST/TDS workflow tracking** — per-client, per-period progress through a fixed stage
  sequence (`documents_requested → documents_received → ready_for_filing → filed`), with a
  document checklist tied to each workflow's required-document catalog.
- **Scheduled document-request emails** — a company sets a day/time once; every enrolled
  client gets an automatic monthly email listing what's needed, via Gmail SMTP.
- **AI document extraction (HandScribe)** — upload up to 10 handwritten/printed invoices at
  once (or pick files already sitting in Drive), get structured, editable fields back
  (invoice no., GSTIN, CGST/SGST/IGST, dates auto-standardized to dd/mm/yyyy...), export to
  Excel/XML. Never guesses a value that isn't actually on the document.
- **Google Drive storage** — every invoice and company document is auto-filed into
  `Company / Year - Month` (or `Company / Company Documents`) folders in a Shared Drive, no
  manual saving required.
- **Dashboards** — color-coded, real-time status across every client and workflow, both
  per-client and rolled up for the whole firm.
- **Role-based access** — company admins get oversight + assignment control; company users do
  the actual filing/upload work. Clients (and even individual workflows) can be split across
  specific team members.

## Structure

```
frontend/    React app (Vite, plain JavaScript/JSX). Only renders UI and calls the backend API.
backend/     Express API (plain JavaScript). Owns all data access, auth checks, the GST/TDS
             automation, scheduled emails, and the Google Drive integration. Talks to Firestore
             via the Firebase Admin SDK.
handscribe/  A separate, vendored Python/FastAPI service doing OCR (Google Vision) + LLM
             structuring (Gemini) of handwritten/printed documents. The backend proxies to it
             (see handscribe/SETUP.md) — it has no auth or tenant concept of its own.
```

Nothing here needs Docker. Cloud dependencies: a free Firebase project (database + login), a
Gmail account (for document-request emails), a Google Cloud Vision + Gemini API key pair (for
AI extraction — optional, only needed if you want that feature), and a Google Drive Shared
Drive (for document storage — also optional, everything else works without it). All three apps
still run on your own machine.

## 1. Create a Firebase project (one-time, ~5 minutes)

1. Go to <https://console.firebase.google.com>, click **Add project**, give it any name.
2. In the left sidebar, open **Build → Firestore Database → Create database**. Pick any region,
   start in **test mode** (we ship our own rules below — you can tighten this later).
3. Open **Build → Authentication → Get started**, click the **Sign-in method** tab, enable
   **Email/Password**. (Login here uses a User ID, not an email — see "How login works" below —
   but it's still built on Firebase's email/password provider under the hood.)
4. Open **Project settings** (gear icon) → **General** tab → scroll to "Your apps" → click the
   **</>** (web) icon → register an app (any nickname, no hosting needed). Copy the `firebaseConfig`
   values shown — you'll paste these into `frontend/.env.local`.
5. Still in **Project settings**, go to the **Service accounts** tab → **Generate new private
   key**. This downloads a JSON file — save it as `backend/serviceAccountKey.json` (already
   gitignored, never commit it). Note the `client_email` inside it — it's reused for Google
   Drive in step 3 below, no second credential needed.
6. Optional but recommended: in **Firestore Database → Rules**, paste the contents of
   [`firestore.rules`](./firestore.rules) from this repo and publish. This is a defense-in-depth
   backstop — the backend enforces isolation either way — but it stops Firestore from being
   readable if a Firebase web config ever leaks.

## 2. Set up Gmail SMTP (for document-request emails)

1. On the Gmail account you want to send from: Google Account → **Security** → turn on
   **2-Step Verification** (required for the next step).
2. Google Account → **Security** → **App passwords** → create one for "Mail" → copy the
   16-character password it gives you.
3. You'll put the Gmail address + that app password into `backend/.env` in step 5.

## 3. Set up Google Drive storage (optional, recommended)

Reuses the **same** Firebase service account from step 1.5 — no second credential to manage.

1. In [Google Cloud Console](https://console.cloud.google.com), on the same project as your
   Firebase project, enable the **Google Drive API**.
2. In Google Drive: left sidebar → **Shared drives** → **Create a shared drive** (must be a
   *Shared* Drive, not a folder in "My Drive" — service accounts have zero storage quota
   outside one, so real file uploads fail with `Service Accounts do not have storage quota`
   otherwise).
3. Open it → **Manage members** → add the service account's `client_email` (from the
   downloaded JSON, looks like `firebase-adminsdk-xxxxx@<project-id>.iam.gserviceaccount.com`)
   with role **Content Manager**.
4. Copy the Shared Drive's ID from its URL (`drive.google.com/drive/folders/<ID>`) — you'll put
   it in `backend/.env` as `GOOGLE_DRIVE_ROOT_FOLDER_ID` in step 5.

Left unset, every Drive-related feature just no-ops silently — everything else still works.

## 4. Set up AI document extraction (optional)

The extractor is a separate service — see [`handscribe/SETUP.md`](./handscribe/SETUP.md) for
full instructions. In short, you'll need:

- A **Google Cloud Vision** API key (OCR) — requires billing enabled on that project.
- One LLM provider key — **Gemini** is the simplest to set up.

Both go into `handscribe/backend/.env` (its own file, separate from `backend/.env`). Left
unconfigured (or just not running), the rest of the app works fine — only the extractor pages
will show a "couldn't reach the extraction service" error.

## 5. Configure the two main apps

```bash
# backend — create backend/.env by hand with the variables below (there's no .env.example
# here on purpose, since every value is a real secret, not a placeholder to copy):
#   PORT=4000
#   FRONTEND_ORIGIN=http://localhost:5173
#   FIREBASE_SERVICE_ACCOUNT_PATH=./serviceAccountKey.json
#   CREDENTIAL_MASTER_KEY=<generate below>
#   GMAIL_USER=<from step 2>
#   GMAIL_APP_PASSWORD=<from step 2>
#   HANDSCRIBE_BASE_URL=http://localhost:8000
#   GOOGLE_DRIVE_ROOT_FOLDER_ID=<from step 3, optional>
cd backend
npm install
node -e "console.log('base64:' + require('crypto').randomBytes(32).toString('base64'))"
# paste that output as CREDENTIAL_MASTER_KEY above
# (serviceAccountKey.json from step 1.5 should already be sitting in backend/)

# frontend
cd ../frontend
npm install
cp .env.example .env.local
# paste the firebaseConfig values from step 1.4 into .env.local
```

## 6. Seed the workflow catalog

```bash
cd backend
npm run seed
```

Writes the `GST` / `TDS` / `PT` catalog entries to Firestore (`workflowDefinitions` collection,
each with a `requiredDocuments` list). Safe to re-run any time.

## 7. Create the platform admin (one-time)

There's no sign-up page — someone has to exist before any login screen means anything:

```bash
cd backend
npm run create-admin -- --userId PLATFORM-ADMIN --password "SomeStrongPass1" --name "Your Name" --email you@example.com
```

Pick any User ID/password you want here; you'll be forced to set a new password on first login
anyway. This is the *only* account ever created outside the app — everyone else gets created by
someone one level up.

## 8. Run it

Up to three terminals, depending on whether you set up Drive/extraction:

```bash
cd backend && npm run dev              # http://localhost:4000
cd frontend && npm run dev             # http://localhost:5173

# optional — only if you set up AI extraction (step 4)
cd handscribe/backend && .venv\Scripts\activate && uvicorn app.main:app --port 8000
```

Open <http://localhost:5173>.

## 9. Walk through the whole thing

1. **Log in** with the platform admin User ID/password from step 7 → forced to **set a real
   password** → lands on **/platform**.
2. **Create a company** (company name, the company admin's name + contact email). The response
   shows a generated **User ID + temp password** — that's what the company admin logs in with.
3. **Sign out**, log in with that company admin User ID/temp password → forced through the same
   password-reset screen → lands on the company **Dashboard**.
4. **Settings → Workflows** → **Activate** GST (simulates the firm's subscription including it).
5. **Clients** → add a client — company details, GSTIN/PAN/TAN/HSN/CIN, address, TDS
   applicability, any custom fields you need, and a contact email (that's who the monthly
   document request goes to). A Drive company folder is created for them automatically if Drive
   is configured.
6. Open the client → **Enable** GST → **Open GST workspace** → enter *any* GST portal
   username/password, tick consent, **Save credentials** (encrypted — check the
   `gstCredential` subcollection in the Firestore console to confirm you only see ciphertext) →
   enter a period like `2026-07`, **Fetch GST data** → watch `QUEUED → RUNNING → WAITING_OTP` →
   submit any 4–8 digit OTP → run finishes `SUCCEEDED` with mock data → **Download CSV/Excel**.
7. Still on the client page: try **Bulk invoice upload** (files land straight in Drive, no
   extraction) and **Upload company documents** (a separate Drive folder from invoices) — both
   admin-visible, but uploading is company-user-only.
8. **Extractor** (sidebar) → pick a template, drop up to 10 invoice images/PDFs (or browse a
   client's existing Drive files instead) → **Extract** → edit any field → **Export Excel/XML**.
9. Back on the client page, the GST workflow shows a **progress bar** — click **Advance to next
   stage** to see it move; the **Dashboard** shows the same thing rolled up across all clients.
10. **Settings → Team** → create a company user → sign out, log in as them, confirm they land
    on the same company's dashboard and can upload/extract/mark-filed (the admin can only view).
11. **Settings → Email schedule** → set a day/time, click **Send now** → check the client's
    contact-email inbox for the document-request email, and confirm their progress bar jumped to
    "Documents requested" automatically.
12. Try **Delete client** (from the Clients list or the client's own page, admin-only) — confirm
    the client and its records disappear from the app, but its Drive folder and every file in it
    are untouched.

If anything gets stuck, check the **backend terminal** first — every route logs errors there,
and Firestore documents (viewable in the Firebase console) always reflect the current state.

## How login works (no self-serve signup)

Every account — platform admin, company admin, company user — is created by someone else and
handed a **User ID** (e.g. `SARNTE-A001`) + temp password out-of-band; first login forces a real
password. Firebase Authentication needs something shaped like an email, so under the hood each
User ID maps to a synthetic address (`{userId}@login.internal`, never actually mailed) — the
login screen only ever shows "User ID." See `backend/src/lib/userId.js` and
`backend/src/lib/accounts.js`.

## How the GST/TDS automation works right now

`backend/src/lib/mockGstAdapter.js` (and its TDS equivalent) simulates the login → OTP →
download flow instead of touching the real government portal — this is what lets you test the
whole pipeline (trigger, OTP relay, data mapping, export) without needing live credentials or
fighting the portal's CAPTCHA. Swapping in a real Playwright-driven scrape later means rewriting
that one adapter's `startSession`/`submitOtp`/`fetchReturn` functions — nothing else changes.
(Before pointing this at a real government portal, read its Terms of Use and get real legal
advice — automated access is a separate question from whether this code works.)

## How AI document extraction works

`backend/src/routes/handscribe.js` is the multi-tenant layer around the separate HandScribe
service — it checks the caller can access the client, proxies the OCR+LLM call, then persists
the result under that client in our own Firestore. Two entry points:

- **Per-client extractor** (on a client's own page) — saves each extraction to that client's
  history, and every uploaded file mirrors into their Drive `Year - Month` folder.
- **Common extractor** (sidebar `/extractor`) — stateless, nothing saved to Firestore, but can
  still browse and pull files from any client's existing Drive folder.

A field the model can't confidently find on the document is left **blank**, never a guess pulled
from elsewhere on the page — see `handscribe/backend/app/utils/mandatory_field_fallback.py` for
the reasoning. Date fields are normalized to `dd/mm/yyyy` regardless of source format, both on
screen and in exports (`backend/src/routes/handscribe.js` / `frontend/src/lib/normalizeDate.js`).

## How Google Drive storage works

`backend/src/lib/googleDrive.js` — folders are created lazily (on first use) and cached on the
client's Firestore doc so normal uploads don't re-query Drive every time:

```
<Shared Drive root>
  └─ <Company name>
       ├─ 2026-07               (invoice month folders — extractor + bulk invoice upload)
       ├─ 2026-08
       └─ Company Documents     (GST/TDS workflow-checklist uploads — separate bucket)
```

Every upload path is best-effort — Drive mirrors what's already stored in Firestore, it never
blocks the underlying feature. If a client's cached folder reference ever goes stale (e.g. from
reconfiguring the root Drive), the next upload self-heals by clearing the cache and rebuilding
fresh, automatically. Deleting a client from the app never touches Drive — its folder just
becomes unlinked from the app, still fully intact and findable by company name.

## Notes on the architecture

- **Tenant isolation**: every account's `orgId`/`role` live on its own `users/{uid}` profile doc,
  looked up by the Firebase-verified uid — never from anything the client sends. See
  `backend/src/middleware/profile.js`.
- **No queue/Redis**: each automation run is a plain async function kept alive in the backend
  process's memory, with the OTP handed back through an in-memory `Map`. Same idea for the
  monthly email schedule (`node-cron` inside the same process). Both only work with a single
  backend process — exactly what "run it locally" means; moving to multiple instances later means
  moving that state to something shared.
- **Credential encryption**: `backend/src/lib/crypto.js` — AES-256-GCM with a per-org key derived
  (HKDF) from `CREDENTIAL_MASTER_KEY`. In production that master key should live in a real
  secrets manager, not a `.env` file.
- **Workflow progress**: a fixed stage sequence per workflow —
  `documents_requested → documents_received → ready_for_filing → filed` — auto-advanced by the
  document checklist, with a manual "mark as filed" as the one deliberate human step (actual
  filing happens on the government portal, outside this app).
- **Client deletion**: `DELETE /api/clients/:clientId` uses Firestore's `recursiveDelete` to wipe
  the client doc and every subcollection under it, but deliberately never calls the Drive API —
  see "How Google Drive storage works" above.
