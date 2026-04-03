# Attack engine — decides attack type based on current simulation mode.
# Keeps attack logic completely separate from base data generation.

from app.services.state import get_mode


def resolve_attack() -> str | None:
    mode = get_mode()
    if mode == "jamming":
        return "jamming"
    if mode == "spoofing":
        return "spoofing"
    return None
