import { useState, useEffect, useCallback } from "react";

export interface SimulationData {
  packet_rate: number;
  snr: number;
  packet_loss: number;
  attack: "jamming" | "spoofing" | null;
  risk: number;
}

export interface Alert {
  id: number;
  message: string;
  time: string;
}

interface UseSimulationReturn {
  data: SimulationData | null;
  alerts: Alert[];
  loading: boolean;
  error: string | null;
  injectAttack: (type: "jamming" | "spoofing") => Promise<void>;
}

const BASE_URL = "http://localhost:8000";

export function useSimulation(pollInterval = 1000): UseSimulationReturn {
  const [data, setData] = useState<SimulationData | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [simRes, alertRes] = await Promise.all([
        fetch(`${BASE_URL}/simulate`),
        fetch(`${BASE_URL}/alerts`),
      ]);
      if (!simRes.ok || !alertRes.ok) throw new Error("Bad response from server");
      const [simData, alertData] = await Promise.all([simRes.json(), alertRes.json()]);
      setData(simData);
      setAlerts(alertData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, []);

  const injectAttack = async (type: "jamming" | "spoofing") => {
    await fetch(`${BASE_URL}/inject/${type}`, { method: "POST" });
    await fetchData();
  };

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, pollInterval);
    return () => clearInterval(id);
  }, [fetchData, pollInterval]);

  return { data, alerts, loading, error, injectAttack };
}
