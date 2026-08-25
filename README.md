# ChildLife Feedback Reporting

Dashboard over the ChildLife patient feedback line. Reads the same MongoDB the
voice agent writes to (`childlife-foundation`), presents it in the foundation's
reporting format, and drives the outbound calling: patient upload, the call
queue, retry policy and calling hours.

The voice agent and dialler live in a separate repository
(`ChildLifeOutbound`, branch `voicebot-outbound`). This one is the web side.

```
backend/    FastAPI + motor + JWT auth
frontend/   React + Vite + Tailwind v4
```

## Pages

| Page | What it does |
|---|---|
| Overview | Call volume, complaint breakdown, outcomes, cost in PKR |
| Call records | Every call, searchable and filterable, with transcripts and Excel export |
| Call queue | Patient upload, upload history, queue state, retry breakdown |
| Settings | Retries, concurrency, calling hours, pause, and the billing rates |
| Help | User guide with screenshots — one section for staff, one for operators |

## Reporting format

The call table and the Excel export both use these columns, in this order:

| Phone Number | Received Time | Disposition Catg | Patient Category | ER name | MR Number | Patient Name | Remarks | Complaint Category | Complaint Sub Category | Area |
|---|---|---|---|---|---|---|---|---|---|---|

- **Complaint Category** — Treatment, Behavior, Waiting Time
- **Complaint Sub Category** — Nursing, Doctor, Pharmacy, Security Guard
- **Area** — Triage, FTO, Retention Area, Counter, Ward, Gate, Other

## Setup

### Backend

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

cp .env.example .env
python -c "import secrets; print(secrets.token_urlsafe(48))"   # paste into JWT_SECRET
```

The app refuses to start without a `JWT_SECRET` of at least 32 characters — it
serves patient records and must not sign tokens with a guessable key.

Create your first user (prompts for the password, so it never reaches shell
history):

```bash
.venv/bin/python seed_user.py --username admin --name "Your Name" --role admin
```

Run it:

```bash
.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8003

```

### Frontend

```bash
cd frontend
npm install
npm run dev     # http://localhost:5174, proxies /api to :8003
```

For production, `npm run build` emits `dist/` — serve it behind nginx and point
`/api` at the backend.

## Configuration

| Variable | Default | Notes |
|---|---|---|
| `JWT_SECRET` | *(none)* | Required, ≥32 chars |
| `JWT_EXPIRE_MINUTES` | `720` | Session length |
| `MONGO_URI` | `mongodb://192.168.1.10:27017/` | Same host the agent writes to |
| `MONGO_DB_NAME` | `childlife-foundation` | |
| `MONGO_CALLS_COLLECTION` | `conversation-logs` | |
| `MONGO_USERS_COLLECTION` | `dashboard-users` | Created by `seed_user.py` |
| `CORS_ORIGINS` | `http://localhost:5174` | Comma-separated |

## API

All routes except `/api/health` require `Authorization: Bearer <token>`.

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/auth/login` | Form login → JWT |
| GET | `/api/auth/me` | Current user |
| GET | `/api/calls` | Paged, filtered call list |
| GET | `/api/calls/filters` | Distinct values actually present |
| GET | `/api/calls/{session_id}` | One call + transcript + metrics |
| GET | `/api/stats/overview` | KPIs, breakdowns, daily trend |
| GET | `/api/export/xlsx` | Excel in the report column order, times in PKT |
| GET | `/api/patients` | Paged patient list |
| GET | `/api/patients/queue` | Who is still due a call, plus retry breakdown |
| GET | `/api/patients/batches` | Upload audit trail |
| GET | `/api/patients/template` | Blank upload sheet |
| POST | `/api/patients/upload` | Import an .xlsx patient list |
| GET | `/api/settings` | Dialler settings (rates omitted without access) |
| PUT | `/api/settings` | Update them |

`/api/calls` and `/api/export/xlsx` accept `search`, `status`, `category`, `er`,
`direction`, `days`.

`POST /api/patients/upload` takes the file plus `recall_existing` (default true):
true means a new round of calls and puts everyone in the sheet back in the queue,
false means a correction and leaves call progress alone.

## Users and access

`seed_user.py` writes `admin` or `viewer` into the user document. **The role is
stored but is not enforced on most routes** — every signed-in user sees the call
records, patient names and transcripts. If you need viewers restricted to
aggregate charts, that check still has to be added to the route dependencies.

The one thing that *is* enforced is costing. The billing rates are gated on a
per-account `can_manage_costing` flag, deliberately separate from the role so an
operations admin can run the calling without seeing the margin. Without the flag
the rate fields are stripped from `GET /api/settings` and a `PUT` cannot change
them, so hiding the card in the UI is not the only control:

```js
db.getCollection("dashboard-users").updateOne(
    {username: "someone"}, {$set: {can_manage_costing: true}})
```

Disable an account without deleting it:

```bash
.venv/bin/python seed_user.py --username someone --disable
```

Each request re-reads the user, so disabling takes effect immediately rather
than when the token expires.

## Notes on the data

- **Two cost figures, deliberately.** `cost.total_cost` on each call record is the
  raw USD provider spend and is **never sent to the browser** — it is our margin,
  not the foundation's business. What the dashboard shows is a rupee figure
  computed from the tariff in Settings (carrier / menu / AI per minute). Internal
  margin reporting lives in `scripts/margin_report.py` in the agent repo.
- **AI minutes are not call duration.** `ai_duration` is the time the model was
  actually in the conversation. The recorded menu is free, so a satisfied caller
  is zero AI minutes however long they were on the line, and billing leans on this
  rather than on `duration`.
- **Timestamps are UTC in Mongo and rendered in PKT.** Records written before
  2026-08-24 may be naive datetimes holding Pakistan wall-clock; they are treated
  as UTC. A *string* timestamp breaks `/api/stats/overview` outright, since the
  aggregation uses `$dateToString`.
- **Transcripts** live under `logs.items` and are excluded from list queries —
  they are only fetched when a call is opened.
- **Archived records.** Anything with `archived: true` is invisible to the
  dashboard, the export and the dialler, without being deleted. Every read of
  `conversation-logs` and `patients` filters on it.
