#!/usr/bin/env python
"""Create or update a dashboard user.

    python seed_user.py --username admin --role admin
    python seed_user.py --username fatima --name "Fatima K" --role viewer

Prompts for the password rather than taking it as an argument, so it never lands
in shell history or the process list.
"""
from __future__ import annotations

import argparse
import getpass
import sys

from pymongo import MongoClient

from app.config import DB_NAME, MONGO_URI, USERS_COLLECTION
from app.security import hash_password

ROLES = ("admin", "viewer")


def main() -> int:
    parser = argparse.ArgumentParser(description="Create or update a dashboard user")
    parser.add_argument("--username", required=True)
    parser.add_argument("--name", default="")
    parser.add_argument("--role", default="viewer", choices=ROLES)
    parser.add_argument("--disable", action="store_true", help="Disable this account")
    args = parser.parse_args()

    password = getpass.getpass("Password: ")
    if len(password) < 8:
        print("Password must be at least 8 characters.", file=sys.stderr)
        return 1
    if password != getpass.getpass("Confirm password: "):
        print("Passwords do not match.", file=sys.stderr)
        return 1

    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    users = client[DB_NAME][USERS_COLLECTION]
    users.create_index("username", unique=True)

    result = users.update_one(
        {"username": args.username},
        {
            "$set": {
                "username": args.username,
                "name": args.name or args.username,
                "role": args.role,
                "password_hash": hash_password(password),
                "disabled": args.disable,
            }
        },
        upsert=True,
    )
    client.close()

    action = "created" if result.upserted_id else "updated"
    print(f"User {args.username!r} {action} with role {args.role!r}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
