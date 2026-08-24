from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm

from ..db import users
from ..security import create_access_token, current_user, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login")
async def login(form: OAuth2PasswordRequestForm = Depends()) -> dict[str, Any]:
    user = await users().find_one({"username": form.username})

    # Same message and code whether the user is missing, disabled, or the password is
    # wrong — otherwise the response tells an attacker which usernames exist.
    if (
        not user
        or user.get("disabled")
        or not verify_password(form.password, user.get("password_hash", ""))
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    role = user.get("role", "viewer")
    return {
        "access_token": create_access_token(user["username"], role),
        "token_type": "bearer",
        "user": {
            "username": user["username"],
            "name": user.get("name", user["username"]),
            "role": role,
            "can_manage_costing": bool(user.get("can_manage_costing")),
        },
    }


@router.get("/me")
async def me(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return {
        "username": user["username"],
        "name": user.get("name", user["username"]),
        "role": user.get("role", "viewer"),
        # Separate from role on purpose: an operations admin can run the calling
        # operation without seeing what it is billed at.
        "can_manage_costing": bool(user.get("can_manage_costing")),
    }
