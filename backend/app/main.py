from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import CORS_ORIGINS, require_jwt_secret
from .db import calls, close_client
from .routers import auth, calls as calls_router, export, stats


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Refuse to serve patient data with a weak signing key.
    require_jwt_secret()
    # Sorting and filtering both lean on timestamp; without this every list request
    # is a collection scan.
    await calls().create_index("timestamp")
    await calls().create_index("session_id")
    yield
    await close_client()


app = FastAPI(
    title="ChildLife Feedback Reporting API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(calls_router.router)
app.include_router(stats.router)
app.include_router(export.router)


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
