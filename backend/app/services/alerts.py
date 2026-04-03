# In-memory alert tracking system.
# Stores attack alerts as a simple list. No database, no persistence.

import time

alerts: list = []


def add_alert(alert_type: str, risk: int) -> None:
    alerts.append({
        "type": alert_type,
        "risk": risk,
        "timestamp": time.time(),
    })


def get_alerts() -> list:
    return alerts
