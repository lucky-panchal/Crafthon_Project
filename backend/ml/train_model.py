"""
train_model.py
Run once to generate isolation_forest_model.pkl + scaler.pkl

Usage:
    cd backend
    python ml/train_model.py
"""

import os
import numpy as np
import joblib
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

N_FEATURES = 77   # must match MODEL_INPUT_SIZE in detection_service.py
OUT_DIR = os.path.dirname(os.path.abspath(__file__))

# ── Synthetic training data ───────────────────────────────────────────────────
rng = np.random.default_rng(42)

# Normal traffic: 4000 samples
normal = rng.normal(loc=0.0, scale=1.0, size=(4000, N_FEATURES))

# Inject realistic signal structure into first 3 features
# feat 0 = packet_rate  (normal ~50 pps)
normal[:, 0] = rng.normal(50, 10, 4000)
# feat 1 = snr          (normal ~25 dB)
normal[:, 1] = rng.normal(25, 5,  4000)
# feat 2 = packet_loss  (normal ~2 %)
normal[:, 2] = rng.normal(2,  1,  4000).clip(0)

# Anomalous traffic: 400 samples (10 % contamination)
anomalous = rng.normal(loc=0.0, scale=1.0, size=(400, N_FEATURES))
anomalous[:, 0] = rng.normal(150, 30, 400)   # traffic spike
anomalous[:, 1] = rng.normal(5,   3,  400)   # very low SNR
anomalous[:, 2] = rng.normal(40,  10, 400).clip(0)  # high loss

X = np.vstack([normal, anomalous])

# ── Train ─────────────────────────────────────────────────────────────────────
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

model = IsolationForest(
    n_estimators=200,
    contamination=0.1,
    random_state=42,
    n_jobs=-1,
)
model.fit(X_scaled)

# ── Save ──────────────────────────────────────────────────────────────────────
model_path  = os.path.join(OUT_DIR, "isolation_forest_model.pkl")
scaler_path = os.path.join(OUT_DIR, "scaler.pkl")

joblib.dump(model,  model_path)
joblib.dump(scaler, scaler_path)

print(f"[TRAIN] Model  saved: {model_path}")
print(f"[TRAIN] Scaler saved: {scaler_path}")
print("[TRAIN] Done - restart the backend server.")
