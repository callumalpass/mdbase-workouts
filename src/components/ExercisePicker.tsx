import { useExercises } from "../hooks/useExercises";
import type { Exercise } from "../lib/types";
import { pathToSlug } from "../lib/utils";

interface Props {
  onSelect: (exercise: Exercise) => void;
  recentSlugs?: string[];
}

export default function ExercisePicker({ onSelect, recentSlugs = [] }: Props) {
  const { exercises, loading, search, setSearch } = useExercises();

  const sorted = [...exercises].sort((a, b) => {
    const aRecent = recentSlugs.indexOf(pathToSlug(a.path));
    const bRecent = recentSlugs.indexOf(pathToSlug(b.path));
    if (aRecent !== -1 && bRecent === -1) return -1;
    if (aRecent === -1 && bRecent !== -1) return 1;
    if (aRecent !== -1 && bRecent !== -1) return aRecent - bRecent;
    return 0;
  });

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        placeholder="Search exercises..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        autoFocus
        className="w-full px-4 py-3 bg-paper border border-rule text-sm
          placeholder:text-faded/50 placeholder:italic
          focus:outline-none focus:border-blush transition-colors"
      />
      {loading ? (
        <p className="text-sm italic text-faded text-center py-4">Loading...</p>
      ) : (
        <div className="max-h-64 overflow-y-auto -mx-1">
          {sorted.map((ex) => (
            <button
              key={ex.path}
              onClick={() => onSelect(ex)}
              className="w-full text-left px-3 py-3 border-l-2 border-transparent
                hover:bg-card hover:border-blush active:bg-rule/30
                transition-colors flex items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{ex.name}</div>
                <div className="text-[10px] font-mono text-faded tracking-wider truncate">
                  {ex.muscle_groups?.join(" · ")}
                </div>
              </div>
              <span className="text-[11px] font-mono uppercase tracking-[0.15em] text-blush shrink-0">
                {ex.tracking?.replace("_", " ")}
              </span>
            </button>
          ))}
          {sorted.length === 0 && (
            <p className="text-sm italic text-faded text-center py-4">No exercises found</p>
          )}
        </div>
      )}
    </div>
  );
}
