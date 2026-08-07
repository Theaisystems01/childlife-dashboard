from __future__ import annotations

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorCollection, AsyncIOMotorDatabase

from .config import CALLS_COLLECTION, DB_NAME, MONGO_URI, USERS_COLLECTION

_client: AsyncIOMotorClient | None = None


def get_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    return _client


def get_db() -> AsyncIOMotorDatabase:
    return get_client()[DB_NAME]


def calls() -> AsyncIOMotorCollection:
    return get_db()[CALLS_COLLECTION]


def users() -> AsyncIOMotorCollection:
    return get_db()[USERS_COLLECTION]


async def close_client() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None
