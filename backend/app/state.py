# Global simulation state.
# mode controls what the backend simulates — normal, jamming, or spoofing.
# FEATURES defines the fixed ML-ready input columns.

mode = "normal"

FEATURES = ["packet_rate", "snr", "packet_loss"]
