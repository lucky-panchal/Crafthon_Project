# Attack simulation logic.
# Each function mutates a copy of the signal data to simulate a specific attack.

import random


def apply_jamming(data: dict) -> dict:
    data = data.copy()
    data["snr"] = round(data["snr"] * random.uniform(0.20, 0.40), 2)
    data["packet_loss"] = round(data["packet_loss"] + random.uniform(0.4, 0.6), 4)
    return data


def apply_spoofing(data: dict) -> dict:
    data = data.copy()
    data["source_id"] = 999
    data["packet_rate"] = data["packet_rate"] + random.randint(5, 15)
    return data


def apply_attack(data: dict, mode: str) -> dict:
    if mode == "jamming":
        return apply_jamming(data)
    if mode == "spoofing":
        return apply_spoofing(data)
    return data
