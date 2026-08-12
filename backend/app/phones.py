from __future__ import annotations

import re
from typing import Any

# Trailing digits that identify a Pakistani subscriber, ignoring whichever of
# +92 / 0092 / 92 / 0 prefix the source happens to use. Mirrors the agent's logic so
# an uploaded number matches the same caller the voice agent sees.
SIGNIFICANT_DIGITS = 10


def normalize(raw: Any) -> str:
    """Reduce a number to its significant trailing digits, for matching."""
    digits = re.sub(r"\D", "", str(raw or ""))
    return digits[-SIGNIFICANT_DIGITS:] if digits else ""


def to_e164(raw: Any) -> str:
    """Canonical +92XXXXXXXXXX form for display and storage."""
    n = normalize(raw)
    return f"+92{n}" if n else ""


def variants(raw: Any) -> list[str]:
    """Every format the same number might appear as, for an $in query."""
    n = normalize(raw)
    if not n:
        return []
    out = [n, f"0{n}", f"92{n}", f"+92{n}", f"0092{n}"]
    original = str(raw or "").strip()
    if original and original not in out:
        out.append(original)
    return out


def is_plausible(raw: Any) -> bool:
    """A Pakistani mobile is 10 significant digits starting with 3 (i.e. 03xx)."""
    n = normalize(raw)
    return len(n) == SIGNIFICANT_DIGITS and n.startswith("3")
