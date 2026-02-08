import type { PlanTemplate } from "../lib/types";
import { parseWikilink, slugToName } from "../lib/utils";

interface Props {
  template: PlanTemplate;
  onStart: (template: PlanTemplate) => void;
  onEdit?: (template: PlanTemplate) => void;
  onDelete?: (template: PlanTemplate) => void;
}

export default function TemplateCard({ template, onStart, onEdit, onDelete }: Props) {
  return (
    <div className="bg-card border-l-2 border-ocean p-4 active:translate-y-px transition-transform">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">{template.title}</h3>
        {(onEdit || onDelete) && (
          <div className="flex items-center gap-1">
            {onEdit && (
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(template); }}
                className="text-faded/50 text-sm hover:text-ocean active:text-ocean transition-colors p-2"
              >
                ✎
              </button>
            )}
            {onDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(template); }}
                className="text-faded/50 text-sm hover:text-blush active:text-blush transition-colors p-2 -mr-2"
              >
                ✕
              </button>
            )}
          </div>
        )}
      </div>

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
        className="w-full py-3 bg-ocean text-white text-xs font-mono font-medium
          uppercase tracking-[0.15em] active:scale-[0.97] transition-transform duration-75"
      >
        Start
      </button>
    </div>
  );
}
