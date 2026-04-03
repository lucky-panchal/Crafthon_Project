# Simulator service — core data generation logic.
# generate_data() is pure. generate_with_attack() composes data + mode + attack.

import random
import time
from app.services.state import get_mode
from app.services.attacks import apply_attack


# Generates a single snapshot of simulated network signal data
def generate_data() -> dict:
    return {
        "packet_rate": random.randint(50, 100),
        "snr": round(random.uniform(20.0, 30.0), 2),
        "packet_loss": round(random.uniform(0.0, 0.05), 4),
        "timestamp": time.time(),
    }


# Composes base data with current mode's attack applied
def generate_with_attack() -> dict:
    data = generate_data()
    mode = get_mode()
    return apply_attack(data, mode)
