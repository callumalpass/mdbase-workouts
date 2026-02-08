import type { PlanTemplate } from "../lib/types";
import { parseWikilink, slugToName } from "../lib/utils";

interface Props {
  template: PlanTemplate;
  onStart: (template: PlanTemplate) => void;
}

export default function TemplateCard({ template, onStart }: Props) {
  return (
    <div className="bg-card border-l-2 border-ocean p-4 active:translate-y-px transition-transform">
      <h3 className="text-sm font-semibold mb-3">{template.title}</h3>

      <div className="space-y-1 mb-4">
        {template.exercises?.map((ex, i) => {
          const name = slugToName(parseWikilink(ex.exercise));
          return (
            <div key={i} className="flex items-baseline gap-2">
              <span className="text-sm truncate flex-1">{name}</span>
              <span className="text-xs font-mono text-faded shrink-0">
                {[
                  ex.target_sets && `${ex.target_sets}×`,
                  ex.target_reps,
                  ex.target_weight && ` @${ex.target_weight}kg`,
                ]
                  .filter(Boolean)
                  .join("")}
              </span>
            </div>
          );
        })}
      </div>

      <button
        onClick={() => onStart(template)}
        className="w-full py-2.5 bg-ocean text-white text-xs font-mono font-medium
          uppercase tracking-[0.15em] active:scale-[0.97] transition-transform duration-75"
      >
        Start
      </button>
    </div>
  );
}
