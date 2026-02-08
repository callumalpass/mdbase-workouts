import type { TrackingType } from "../lib/types";

interface Props {
  tracking: TrackingType;
  weight: string;
  reps: string;
  duration: string;
  distance: string;
  onWeightChange: (v: string) => void;
  onRepsChange: (v: string) => void;
  onDurationChange: (v: string) => void;
  onDistanceChange: (v: string) => void;
}

export default function SetInput({
  tracking,
  weight,
  reps,
  duration,
  distance,
  onWeightChange,
  onRepsChange,
  onDurationChange,
  onDistanceChange,
}: Props) {
  const inputClass =
    "w-full px-3 py-3 bg-paper border border-rule text-sm font-mono text-ink text-center" +
    " focus:outline-none focus:border-blush transition-colors";

  const labelClass = "text-[11px] font-mono text-faded uppercase tracking-[0.15em] mb-1 block";

  if (tracking === "weight_reps") {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Weight (kg)</label>
          <input
            type="number"
            inputMode="decimal"
            value={weight}
            onChange={(e) => onWeightChange(e.target.value)}
            placeholder="0"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Reps</label>
          <input
            type="number"
            inputMode="numeric"
            value={reps}
            onChange={(e) => onRepsChange(e.target.value)}
            placeholder="0"
            className={inputClass}
          />
        </div>
      </div>
    );
  }

  if (tracking === "reps_only") {
    return (
      <div>
        <label className={labelClass}>Reps</label>
        <input
          type="number"
          inputMode="numeric"
          value={reps}
          onChange={(e) => onRepsChange(e.target.value)}
          placeholder="0"
          className={inputClass}
        />
      </div>
    );
  }

  if (tracking === "timed") {
    return (
      <div>
        <label className={labelClass}>Duration (seconds)</label>
        <input
          type="number"
          inputMode="numeric"
          value={duration}
          onChange={(e) => onDurationChange(e.target.value)}
          placeholder="0"
          className={inputClass}
        />
      </div>
    );
  }

  return (
    <div>
      <label className={labelClass}>Distance (km)</label>
      <input
        type="number"
        inputMode="decimal"
        value={distance}
        onChange={(e) => onDistanceChange(e.target.value)}
        placeholder="0"
        className={inputClass}
      />
    </div>
  );
}
