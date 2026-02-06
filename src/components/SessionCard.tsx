import type { Session } from "../lib/types";
import { formatDate, formatTime, parseWikilink, slugToName, formatSet } from "../lib/utils";

interface Props {
  session: Session;
}

export default function SessionCard({ session }: Props) {
  return (
    <div className="bg-card border-l-2 border-rule p-4 hover:border-blush transition-colors active:translate-y-px">
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
