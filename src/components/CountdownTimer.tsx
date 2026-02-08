import { useState, useEffect, useRef } from "react";
import { haptics } from "../lib/haptics";

interface Props {
  duration: number;
  onComplete: () => void;
  onSkip: () => void;
}

export default function CountdownTimer({ duration, onComplete, onSkip }: Props) {
  const [remaining, setRemaining] = useState(duration);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    setRemaining(duration);
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      const left = duration - elapsed;
      if (left <= 0) {
        clearInterval(interval);
        setRemaining(0);
        haptics.success();
        onCompleteRef.current();
      } else {
        setRemaining(left);
      }
    }, 250);
    return () => clearInterval(interval);
  }, [duration]);

  const progress = duration > 0 ? (duration - remaining) / duration : 0;
  const min = Math.floor(remaining / 60);
  const sec = remaining % 60;

  return (
    <div className="flex items-center gap-3 px-5 py-2 bg-ocean/10 border-t border-ocean/20">
      <div className="flex-1 h-1.5 bg-ocean/20 rounded-full overflow-hidden">
        <div
          className="h-full bg-ocean transition-all duration-200 rounded-full"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      <span className="text-sm font-mono font-medium text-ocean tabular-nums min-w-[3rem] text-right">
        {min}:{sec.toString().padStart(2, "0")}
      </span>
      <button
        onClick={onSkip}
        className="text-xs font-mono text-ocean/70 uppercase tracking-wider active:text-ocean"
      >
        Skip
      </button>
    </div>
  );
}
