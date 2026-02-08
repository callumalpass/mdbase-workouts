import { useState } from "react";
import { useSessions } from "../hooks/useSessions";
import { useExercises } from "../hooks/useExercises";
import { pathToSlug } from "../lib/utils";
import { api } from "../lib/api";
import SessionCard from "./SessionCard";
import ExerciseCard from "./ExerciseCard";
import ExerciseDetailView from "./ExerciseDetailView";
import ConfirmDialog from "./ConfirmDialog";

type View = "sessions" | "exercises";

export default function HistoryTab() {
  const [view, setView] = useState<View>("sessions");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const { sessions, loading: sessionsLoading, hasMore, loadMore, refresh } = useSessions();
  const { exercises, loading: exercisesLoading, search, setSearch } = useExercises();
  const [deletingPath, setDeletingPath] = useState<string | null>(null);

  if (selectedSlug) {
    return <ExerciseDetailView slug={selectedSlug} onBack={() => setSelectedSlug(null)} />;
  }

  const handleDeleteConfirm = async () => {
    if (!deletingPath) return;
    const id = pathToSlug(deletingPath);
    try {
      await api.sessions.delete(id);
      refresh();
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
    setDeletingPath(null);
  };

  return (
    <div className="p-5 pb-20 space-y-6">
      <h1 className="text-4xl font-bold tracking-tight pt-3">History</h1>

      {/* View toggle */}
      <div className="flex border-b border-rule">
        {(["sessions", "exercises"] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`flex-1 py-2.5 text-sm italic transition-colors relative ${
              view === v ? "text-blush" : "text-faded"
            }`}
          >
            {v}
            {view === v && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-blush" />
            )}
          </button>
        ))}
      </div>

      {view === "sessions" && (
        <div className="space-y-3">
          {sessionsLoading ? (
            <p className="text-sm italic text-faded text-center py-8">Loading...</p>
          ) : sessions.length === 0 ? (
            <p className="text-sm italic text-faded text-center py-8">
              No sessions yet
            </p>
          ) : (
            <>
              {sessions.map((s) => (
                <SessionCard
                  key={s.path}
                  session={s}
                  onDelete={(path) => setDeletingPath(path)}
                />
              ))}
              {hasMore && (
                <button
                  onClick={loadMore}
                  className="w-full py-3 text-xs font-mono text-blush uppercase tracking-widest
                    border border-dashed border-rule active:bg-card active:scale-[0.98] transition-all duration-75"
                >
                  Load more
                </button>
              )}
            </>
          )}
        </div>
      )}

      {view === "exercises" && (
        <div className="space-y-4">
          <input
            type="text"
            placeholder="Search exercises..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-3 bg-card border border-rule text-sm
              placeholder:text-faded/60 placeholder:italic
              focus:outline-none focus:border-blush transition-colors"
          />
          {exercisesLoading ? (
            <p className="text-sm italic text-faded text-center py-8">Loading...</p>
          ) : (
            <div className="space-y-3">
              {exercises.map((ex) => (
                <ExerciseCard
                  key={ex.path}
                  exercise={ex}
                  onClick={() => setSelectedSlug(pathToSlug(ex.path))}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!deletingPath}
        title="Delete Session"
        message="This will permanently delete this workout session. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingPath(null)}
      />
    </div>
  );
}
