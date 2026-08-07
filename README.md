# ChildLife Feedback Reporting

Dashboard over the inbound feedback line. Reads the same MongoDB the
`childlife-agent` voice agent writes to (`childlife-foundation.conversation-logs`)
and presents it in the foundation's reporting format.

Built alongside `childlife-dashboard/` (the Streamlit outbound dialer), which is
untouched.

```
backend/    FastAPI + motor + JWT auth
frontend/   React + Vite + Tailwind v4
```

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
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev     # http://localhost:5174, proxies /api to :8000
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
| GET | `/api/export/xlsx` | Excel in the report column order |

`/api/calls` and `/api/export/xlsx` accept `search`, `status`, `category`, `er`,
`direction`, `days`.

## Users and roles

`seed_user.py` writes `admin` or `viewer` into the user document. **The roles are
stored but not yet enforced** — every signed-in user currently sees every route,
including patient names and transcripts. If you need viewers restricted to
aggregate charts, that check still has to be added to the route dependencies.

Disable an account without deleting it:

```bash
.venv/bin/python seed_user.py --username someone --disable
```

Each request re-reads the user, so disabling takes effect immediately rather
than when the token expires.

## Notes on the data

- **Legacy records.** Three older calls carry `Treatment/Doctor` as a complaint
  category, which is not one of the three valid values. They pre-date the
  taxonomy fix in the agent; new calls are clean. They will show up in the
  category filter until they are corrected or removed.
- **Cost** is `cost.total_cost` per call. Realtime-era records mostly show `0.0`.
- **Transcripts** live under `logs.items` and are excluded from list queries —
  they are only fetched when a call is opened.
