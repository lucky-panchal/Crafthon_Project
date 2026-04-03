# Attack engine — decides attack type based on current simulation mode.
# Keeps attack logic completely separate from base data generation.

import app.state as state


def resolve_attack() -> str | None:
    if state.mode == "jamming":
        return "jamming"
    if state.mode == "spoofing":
        return "spoofing"
    return None
