from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv(".env")

# Same Mongo the agent writes to. Defaults match ChildLifeOutbound so the dashboard
# reads real data with no configuration on this host.
MONGO_URI = os.getenv("MONGO_URI", "mongodb://192.168.1.10:27017/")
DB_NAME = os.getenv("MONGO_DB_NAME", "childlife-foundation")
CALLS_COLLECTION = os.getenv("MONGO_CALLS_COLLECTION", "conversation-logs")
USERS_COLLECTION = os.getenv("MONGO_USERS_COLLECTION", "dashboard-users")

# Generate with: python -c "import secrets; print(secrets.token_urlsafe(48))"
JWT_SECRET = os.getenv("JWT_SECRET", "")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", str(12 * 60)))

CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:5174").split(",")
    if origin.strip()
]


def require_jwt_secret() -> str:
    """Fail loudly at startup rather than signing tokens with a guessable key.

    A dashboard serving patient names, MR numbers and medical complaints must not
    fall back to a default secret.
    """
    if not JWT_SECRET or len(JWT_SECRET) < 32:
        raise RuntimeError(
            "JWT_SECRET is missing or too short (need >= 32 chars). Generate one with:\n"
            '  python -c "import secrets; print(secrets.token_urlsafe(48))"\n'
            "then set it in backend/.env"
        )
    return JWT_SECRET
