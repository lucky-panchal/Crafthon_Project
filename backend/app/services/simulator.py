# Simulator service — core data generation logic.
# generate_data() is pure. generate_with_attack() composes data + mode + attack.

import random
import time
from app.services.state import get_mode, update_detection_state
from app.services.attacks import apply_attack
from app.services.alerts import add_alert, alerts, trigger_alert_if_needed


# Generates a single snapshot of simulated network signal data
def generate_data() -> dict:
    return {
        "packet_rate": random.randint(50, 100),
        "snr": round(random.uniform(20.0, 30.0), 2),
        "packet_loss": round(random.uniform(0.0, 0.05), 4),
        "timestamp": time.time(),
    }


# Composes base data with current mode's attack applied
# Fires an alert if mode is not normal and attack type has changed
# Runs ML detection and attaches result to payload
def generate_with_attack() -> dict:
    data = generate_data()
    mode = get_mode()
    if mode != "normal":
        last = alerts[-1]["message"] if alerts else None
        if last is None or mode not in last.lower():
            add_alert(mode, 80)
    telemetry = apply_attack(data, mode)

    # ML detection
    try:
        from app.services.detection_service import analyze_telemetry
        detection = analyze_telemetry(telemetry)
        update_detection_state(detection)
        trigger_alert_if_needed(detection)
        telemetry["detection"] = detection
    except Exception:
        pass  # never break telemetry stream on ML failure

    return telemetry
