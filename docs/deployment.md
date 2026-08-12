# ChildLife — Deployment Overview

Where each part of the ChildLife patient-feedback system runs.

*Verified 12 Aug 2026.*

---

## At a glance

| Component | Where it runs | Public address | Status |
|---|---|---|---|
| **Voice agent** | AIServer (this host) | — (reached via LiveKit) | Running |
| **LiveKit server** | AIServer, self-hosted | `wss://livekit.ai-iscp.com` | Running |
| **LiveKit SIP** | AIServer, port 5060 | — (trunk-facing) | Running |
| **Dashboard API** | AIServer, port 8003 | `https://childlife-dashboard-v2.ai-iscp.com` | Running |
| **Dashboard frontend** | Not yet deployed | — | Dev server only |
| **Database** | MongoDB @ `192.168.1.10:27017` | — (LAN only) | Running |
| **Telephony** | Telecard SIP trunk | DID `+2138343010` | Live |

Everything is **self-hosted on our own infrastructure**. There is no dependency on
LiveKit Cloud or Twilio — both were removed when the agent moved to inbound.

---

## 1. Voice agent (backend)

The AI that answers calls and holds the conversation.

- **Runs on:** AIServer, as a Python process (`agent_stt_tts_llm.py`)
- **Registers as:** `childlife-agent` — this name must match the LiveKit dispatch rule,
  or calls connect and no agent joins
- **Health port:** 8082
- **Repository:** Azure DevOps — `TheAISystem/ChildLifeOutbound`, branch `voicebot-v2`

It connects out to OpenAI for speech-to-text, the language model and text-to-speech.
Nothing else leaves the premises.

**Not yet a service.** It currently runs as a manually started process, so it does not
survive a reboot. Moving it to systemd is outstanding.

## 2. LiveKit + SIP (call handling)

Self-hosted; manages the call, audio and keypad presses.

- **LiveKit server:** port 7880, published at `wss://livekit.ai-iscp.com`
- **SIP service:** port 5060, plus RTP media ports
- **Redis:** required for the two to talk to each other
- **Inbound trunk:** `ST_RatXp385WtnP` (Telecard), number **+2138343010**
- **Dispatch rule:** `SDR_2pJbvLPoPoiA` → room prefix `phone-childlife_`, agent
  `childlife-agent`

This server is shared with other projects (Mayfair, Leopards, Khizer, Dawlance), each
with its own trunk and dispatch rule.

## 3. Dashboard API (backend)

FastAPI service providing reports, search and Excel export.

- **Runs on:** AIServer, port 8003
- **Public address:** `https://childlife-dashboard-v2.ai-iscp.com`
- **Reverse proxy:** nginx, terminating TLS
- **Authentication:** username/password sign-in, JWT sessions; every route except the
  health check requires a token
- **Repository:** GitHub — `Theaisystems01/childlife-dashboard`, branch `main`

**Note:** `/docs` and `/openapi.json` are currently publicly readable. No data is
exposed (all routes require authentication), but the API surface is visible to anyone.
Disabling them in production is recommended.

## 4. Dashboard frontend

React application — Overview, Call records and Call queue.

- **Currently:** run from a development server on port 5174 when needed. **Not
  deployed to a permanent address.**
- **Prepared for Vercel:** `frontend/vercel.json` is committed and routes `/api` to the
  dashboard API, so frontend and API share one origin. No environment variables are
  needed for that deployment.
- **Alternative:** nginx can serve the built files directly from `frontend/dist`; the
  server block is committed at `deploy/nginx.conf`.

**This is the main outstanding deployment item.** Until it is deployed, the dashboard is
only usable by someone starting the dev server on the host.

## 5. Database

- **MongoDB** at `192.168.1.10:27017`, database `childlife-foundation`
- Collections: `conversation-logs` (calls, transcripts, feedback), `patients` (uploaded
  patient lists), `dashboard-users` (dashboard logins)
- **Private LAN address** — not reachable from outside, which is why the dashboard API
  must stay on our own infrastructure rather than a cloud host

---

## Data flow

```
Caller ──► Telecard trunk ──► LiveKit SIP ──► LiveKit server
                                                   │
                                          dispatch "childlife-agent"
                                                   │
                                             Voice agent ──► OpenAI (STT / LLM / TTS)
                                                   │
                                                   ▼
                                              MongoDB
                                                   │
                                    Dashboard API ──► Dashboard frontend
```

---

## Repositories

| What | Where | Branch |
|---|---|---|
| Voice agent | Azure DevOps · `TheAISystem/ChildLifeOutbound` | `voicebot-v2` |
| Dashboard (API + frontend) | GitHub · `Theaisystems01/childlife-dashboard` | `main` |

---

## Outstanding

1. **Deploy the dashboard frontend** to a permanent address (Vercel or nginx).
2. **Run the voice agent and dashboard API as services** so they survive a reboot —
   both currently run as manually started processes.
3. **Upload a real patient list.** Caller identification currently falls back to
   historical call records, which contain test data; several names sit against the same
   number, so a caller can be greeted by the wrong child's name.
4. **Disable the public API docs** in production.
5. **Confirm call direction with the client.** The system currently *receives* calls on
   a published number. The client's brief describes the foundation *placing* calls, and
   their caller-ID question only applies to outgoing calls.
