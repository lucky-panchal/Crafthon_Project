# Global simulation state.
# Controls what mode the backend is currently simulating.

ALLOWED_MODES = {"normal", "jamming", "spoofing"}

FEATURES = ["packet_rate", "snr", "packet_loss"]

mode = "normal"


def set_mode(new_mode: str) -> None:
    global mode
    if new_mode not in ALLOWED_MODES:
        raise ValueError(f"Invalid mode '{new_mode}'. Allowed: {ALLOWED_MODES}")
    mode = new_mode


def get_mode() -> str:
    return mode
