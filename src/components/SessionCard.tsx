import type { Session } from "../lib/types";
import { formatDate, formatTime, parseWikilink, slugToName, formatSet } from "../lib/utils";

interface Props {
  session: Session;
  onDelete?: (path: string) => void;
}

export default function SessionCard({ session, onDelete }: Props) {
  return (
    <div className="relative bg-card border-l-2 border-rule p-4 hover:border-blush transition-colors active:translate-y-px">
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(session.path); }}
          className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center
            text-faded/50 text-xs hover:text-blush active:text-blush transition-colors"
        >
          ✕
        </button>
      )}

      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold">
          {formatDate(session.date)}
        </span>
        <span className="text-[10px] font-mono text-faded">
          {formatTime(session.date)}
          {session.duration_minutes ? ` · ${session.duration_minutes}min` : ""}
        </span>
      </div>

      {session.rating && (
        <div className="flex gap-1 mb-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <span
              key={n}
              className={`w-2 h-2 ${n <= session.rating! ? "bg-blush" : "bg-rule"}`}
            />
          ))}
        </div>
      )}

      <div className="space-y-1">
        {session.exercises?.map((ex, i) => {
          const name = slugToName(parseWikilink(ex.exercise));
          return (
            <div key={i} className="flex items-baseline gap-2">
              <span className="text-sm font-medium truncate flex-1">{name}</span>
              <span className="text-xs font-mono text-faded shrink-0">
                {ex.sets?.map((s) => formatSet(s)).join(" / ")}
              </span>
            </div>
          );
        })}
      </div>

      {session.notes && (
        <p className="text-xs italic text-faded mt-2 line-clamp-2">{session.notes}</p>
      )}
    </div>
  );
}
