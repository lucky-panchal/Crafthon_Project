import random
import time


def generate_data() -> dict:
    return {
        "packet_rate": random.randint(50, 100),
        "snr": round(random.uniform(20.0, 30.0), 2),
        "packet_loss": round(random.uniform(0.0, 0.05), 4),
        "timestamp": time.time(),
    }
