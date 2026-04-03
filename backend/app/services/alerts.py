# In-memory alert tracking system.
# Alert shape matches frontend Alert interface: { id, message, time }

from datetime import datetime

alerts: list = []
_counter = 0


def add_alert(alert_type: str, risk: int) -> None:
    global _counter
    _counter += 1
    alerts.append({
        "id": _counter,
        "message": f"{alert_type.capitalize()} attack detected (risk: {risk})",
        "time": datetime.now().strftime("%H:%M:%S"),
    })


def get_alerts() -> list:
    return alerts
