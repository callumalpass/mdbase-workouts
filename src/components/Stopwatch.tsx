import { useState, useRef, useCallback } from "react";
import { haptics } from "../lib/haptics";

interface Props {
  onStop: (seconds: number) => void;
}

export default function Stopwatch({ onStop }: Props) {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const startRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const start = useCallback(() => {
    startRef.current = Date.now() - elapsed * 1000;
    setRunning(true);
    intervalRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 250);
  }, [elapsed]);

  const stop = useCallback(() => {
    clearInterval(intervalRef.current);
    setRunning(false);
    const secs = Math.floor((Date.now() - startRef.current) / 1000);
    setElapsed(secs);
    haptics.success();
    onStop(secs);
  }, [onStop]);

  const reset = useCallback(() => {
    clearInterval(intervalRef.current);
    setRunning(false);
    setElapsed(0);
  }, []);

  const min = Math.floor(elapsed / 60);
  const sec = elapsed % 60;

  return (
    <div className="flex flex-col items-center gap-3 py-3">
      <span className="text-3xl font-mono font-medium text-ink tabular-nums">
        {min}:{sec.toString().padStart(2, "0")}
      </span>
      <div className="flex gap-3">
        {!running ? (
          <button
            type="button"
            onClick={start}
            className="px-5 py-2 bg-ocean text-white text-sm font-mono uppercase tracking-wider rounded active:opacity-80 transition-opacity"
          >
            {elapsed > 0 ? "Resume" : "Start"}
          </button>
        ) : (
          <button
            type="button"
            onClick={stop}
            className="px-5 py-2 bg-blush text-white text-sm font-mono uppercase tracking-wider rounded active:opacity-80 transition-opacity"
          >
            Stop
          </button>
        )}
        {!running && elapsed > 0 && (
          <button
            type="button"
            onClick={reset}
            className="px-5 py-2 bg-paper border border-rule text-faded text-sm font-mono uppercase tracking-wider rounded active:opacity-80 transition-opacity"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
