import { useEffect, useRef } from "react";
import useSimulationStore from "../store/useSimulationStore";

export function useSiren() {
  const mode     = useSimulationStore((s) => s.mode);
  const audioRef = useRef(null);

  useEffect(() => {
    // Lazy-init audio once
    if (!audioRef.current) {
      audioRef.current = new Audio("/siren.mp3");
      audioRef.current.loop   = true;
      audioRef.current.volume = 0.5;
    }

    const audio = audioRef.current;

    if (mode === "JAMMING" || mode === "SPOOFING") {
      // Only play if not already playing
      if (audio.paused) {
        audio.currentTime = 0;
        audio.play().catch(() => {
          // Browser blocks autoplay before user gesture — silently ignore
        });
      }
    } else {
      // Fade out smoothly
      if (!audio.paused) {
        const fade = setInterval(() => {
          if (audio.volume > 0.05) {
            audio.volume = Math.max(0, audio.volume - 0.05);
          } else {
            audio.pause();
            audio.volume = 0.5;
            clearInterval(fade);
          }
        }, 50);
      }
    }
  }, [mode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);
}
