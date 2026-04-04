import sys
sys.stderr.write("A\n")
from pydantic import BaseModel
from typing import Optional, List
sys.stderr.write("B\n")

class R(BaseModel):
    snr: Optional[float] = None
    packetLoss: Optional[float] = None
    packetRate: Optional[float] = None
    model_config = {"extra": "allow"}

class Req(BaseModel):
    rows: List[R]
    filename: Optional[str] = ""

sys.stderr.write("C\n")

cases = [
    ("normal",      {"rows": [{"snr": 25.0, "packetLoss": 5.0, "packetRate": 300.0}], "filename": "x"}),
    ("empty_str",   {"rows": [{"snr": "", "packetLoss": "", "packetRate": ""}], "filename": "x"}),
    ("str_numbers", {"rows": [{"snr": "25.5", "packetLoss": "5", "packetRate": "300"}], "filename": "x"}),
    ("non_numeric", {"rows": [{"snr": "abc", "packetLoss": 5}], "filename": "x"}),
    ("none_vals",   {"rows": [{"snr": None, "packetLoss": None, "packetRate": None}], "filename": "x"}),
    ("extra_cols",  {"rows": [{"snr": 20.0, "packetLoss": 3.0, "packetRate": 200.0, "source_id": 999, "label": "attack"}], "filename": "x"}),
]

for name, payload in cases:
    try:
        r = Req(**payload)
        sys.stderr.write(f"OK  {name}: snr={r.rows[0].snr}\n")
    except Exception as e:
        sys.stderr.write(f"FAIL {name}: {str(e)[:300]}\n")

sys.stderr.write("DONE\n")
