import type { Exercise } from "../lib/types";

interface Props {
  exercise: Exercise;
  onClick?: () => void;
}

export default function ExerciseCard({ exercise, onClick }: Props) {
  const trackingLabels: Record<string, string> = {
    weight_reps: "wt × rep",
    reps_only: "reps",
    timed: "timed",
    distance: "dist",
  };

  return (
    <div
      onClick={onClick}
      className={`bg-card border-l-2 border-rule p-4 hover:border-blush transition-colors active:translate-y-px${onClick ? " cursor-pointer" : ""}`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <h3 className="text-sm font-semibold">{exercise.name}</h3>
        <span className="text-[9px] font-mono uppercase tracking-[0.15em] text-faded">
          {exercise.equipment}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {exercise.muscle_groups?.map((g) => (
            <span
              key={g}
              className="text-[9px] font-mono px-1.5 py-0.5 bg-paper text-faded uppercase tracking-wider"
            >
              {g}
            </span>
          ))}
        </div>
        <span className="text-[9px] font-mono text-blush ml-auto tracking-wider">
          {trackingLabels[exercise.tracking] || exercise.tracking}
        </span>
      </div>
    </div>
  );
}
