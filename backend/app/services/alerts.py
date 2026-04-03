import time

alerts: list[dict] = []


def add_alert(attack_type: str, confidence: int) -> None:
    alerts.append({
        "type":       attack_type,
        "message":    f"{attack_type.capitalize()} attack detected",
        "confidence": confidence,
        "timestamp":  time.time(),
    })


def get_alerts() -> list[dict]:
    return list(reversed(alerts))
