import type { Plan } from "../lib/types";
import { parseWikilink, slugToName } from "../lib/utils";

interface Props {
  plan: Plan;
  onStartWorkout?: (plan: Plan) => void;
}

export default function PlanCard({ plan, onStartWorkout }: Props) {
  const statusStyles: Record<string, string> = {
    scheduled: "border-ocean text-ocean",
    completed: "border-sage text-sage",
    skipped: "border-rule text-faded",
  };

  return (
    <div className="bg-card border-l-2 border-blush p-4 active:translate-y-px transition-transform">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">{plan.title}</h3>
        <span
          className={`text-[9px] font-mono uppercase tracking-[0.2em] px-2 py-0.5 border ${
            statusStyles[plan.status] || "border-rule text-faded"
          }`}
        >
          {plan.status}
        </span>
      </div>

      <div className="space-y-1 mb-4">
        {plan.exercises?.map((ex, i) => {
          const name = slugToName(parseWikilink(ex.exercise));
          return (
            <div key={i} className="flex items-baseline gap-2">
              <span className="text-sm truncate flex-1">{name}</span>
              <span className="text-xs font-mono text-faded shrink-0">
                {[
                  ex.target_sets && `${ex.target_sets}×`,
                  ex.target_reps && `${ex.target_reps}`,
                  ex.target_weight && ` @${ex.target_weight}kg`,
                ]
                  .filter(Boolean)
                  .join("")}
              </span>
            </div>
          );
        })}
      </div>

      {plan.status === "scheduled" && onStartWorkout && (
        <button
          onClick={() => onStartWorkout(plan)}
          className="w-full py-2.5 bg-blush text-white text-xs font-mono font-medium
            uppercase tracking-[0.15em] active:scale-[0.97] transition-transform duration-75"
        >
          Start Workout
        </button>
      )}
    </div>
  );
}
