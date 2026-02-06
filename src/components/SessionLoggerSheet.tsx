import { useState, useEffect, useRef } from "react";
import type { Plan, Exercise, TrackingType } from "../lib/types";
import { api } from "../lib/api";
import { parseWikilink, slugToName, pathToSlug } from "../lib/utils";
import { haptics } from "../lib/haptics";
import { useLastUsed } from "../hooks/useLocalStorage";
import SuccessStamp from "./SuccessStamp";

interface SetEntry {
  weight: string;
  reps: string;
  duration: string;
  distance: string;
  done: boolean;
}

interface ExerciseLog {
  slug: string;
  name: string;
  tracking: TrackingType;
  targetSets: number;
  targetReps: number;
  targetWeight: number | null;
  sets: SetEntry[];
}

interface Props {
  plan: Plan | null;
  exercises: Exercise[];
  onClose: () => void;
  onSaved: () => void;
}

function emptySet(): SetEntry {
  return { weight: "", reps: "", duration: "", distance: "", done: false };
}

export default function SessionLoggerSheet({ plan, exercises: allExercises, onClose, onSaved }: Props) {
  const [exerciseLogs, setExerciseLogs] = useState<ExerciseLog[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [showFinish, setShowFinish] = useState(false);
  const [showStamp, setShowStamp] = useState(false);
  const [duration, setDuration] = useState("");
  const [rating, setRating] = useState(0);
  const [notes, setNotes] = useState("");
  const startTimeRef = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const { getLastUsed, saveLastUsed } = useLastUsed();

  useEffect(() => {
    if (!plan) return;
    const logs: ExerciseLog[] = plan.exercises.map((planEx) => {
      const slug = parseWikilink(planEx.exercise);
      const exerciseData = allExercises.find((e) => pathToSlug(e.path) === slug);
      const tracking = exerciseData?.tracking || "weight_reps";
      const targetSets = planEx.target_sets || 3;
      const lastUsed = getLastUsed(slug);

      const sets: SetEntry[] = Array.from({ length: targetSets }, () => ({
        weight: planEx.target_weight
          ? String(planEx.target_weight)
          : lastUsed.weight != null
          ? String(lastUsed.weight)
          : "",
        reps: planEx.target_reps
          ? String(planEx.target_reps)
          : lastUsed.reps != null
          ? String(lastUsed.reps)
          : "",
        duration: "",
        distance: "",
        done: false,
      }));

      return {
        slug,
        name: exerciseData?.name || slugToName(slug),
        tracking,
        targetSets,
        targetReps: planEx.target_reps || 0,
        targetWeight: planEx.target_weight || null,
        sets,
      };
    });
    setExerciseLogs(logs);
  }, [plan, allExercises]);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!plan) return null;

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const currentLog = exerciseLogs[activeIndex];

  const handleSetChange = (
    exerciseIdx: number,
    setIdx: number,
    field: keyof SetEntry,
    value: string | boolean
  ) => {
    setExerciseLogs((prev) =>
      prev.map((log, ei) =>
        ei === exerciseIdx
          ? {
              ...log,
              sets: log.sets.map((s, si) =>
                si === setIdx ? { ...s, [field]: value } : s
              ),
            }
          : log
      )
    );
  };

  const handleAddSet = (exerciseIdx: number) => {
    setExerciseLogs((prev) =>
      prev.map((log, ei) =>
        ei === exerciseIdx
          ? {
              ...log,
              sets: [
                ...log.sets,
                {
                  ...emptySet(),
                  weight: log.sets[log.sets.length - 1]?.weight || "",
                  reps: log.sets[log.sets.length - 1]?.reps || "",
                },
              ],
            }
          : log
      )
    );
  };

  const handleRemoveSet = (exerciseIdx: number, setIdx: number) => {
    setExerciseLogs((prev) =>
      prev.map((log, ei) =>
        ei === exerciseIdx && log.sets.length > 1
          ? { ...log, sets: log.sets.filter((_, si) => si !== setIdx) }
          : log
      )
    );
  };

  const handleToggleDone = (exerciseIdx: number, setIdx: number) => {
    const log = exerciseLogs[exerciseIdx];
    const set = log.sets[setIdx];
    haptics.heavy();
    handleSetChange(exerciseIdx, setIdx, "done", !set.done);
  };

  const totalSetsCompleted = exerciseLogs.reduce(
    (sum, log) => sum + log.sets.filter((s) => s.done).length,
    0
  );
  const totalSets = exerciseLogs.reduce((sum, log) => sum + log.sets.length, 0);

  const handleSave = async () => {
    setSaving(true);
    const planSlug = pathToSlug(plan.path);
    const elapsedMin = Math.round((Date.now() - startTimeRef.current) / 60000);
    const finalDuration = duration ? Number(duration) : elapsedMin > 0 ? elapsedMin : undefined;

    const sessionExercises = exerciseLogs
      .filter((log) => log.sets.some((s) => s.done))
      .map((log) => {
        const lastDone = [...log.sets].reverse().find((s) => s.done);
        if (lastDone) {
          saveLastUsed(log.slug, {
            ...(lastDone.weight ? { weight: Number(lastDone.weight) } : {}),
            ...(lastDone.reps ? { reps: Number(lastDone.reps) } : {}),
          });
        }

        return {
          exercise: log.slug,
          sets: log.sets
            .filter((s) => s.done)
            .map((s) => ({
              ...(s.reps && { reps: Number(s.reps) }),
              ...(s.weight && { weight: Number(s.weight) }),
              ...(s.duration && { duration_seconds: Number(s.duration) }),
              ...(s.distance && { distance: Number(s.distance) }),
            })),
        };
      });

    try {
      await api.sessions.create({
        date: new Date().toISOString(),
        exercises: sessionExercises,
        plan: planSlug,
        ...(finalDuration != null && { duration_minutes: finalDuration }),
        ...(rating > 0 && { rating }),
        ...(notes.trim() && { notes: notes.trim() }),
      });
      setShowStamp(true);
    } catch (err) {
      console.error("Failed to save session:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleStampDone = () => {
    setShowStamp(false);
    onSaved();
    onClose();
  };

  const inputClass =
    "w-full px-2 py-2.5 bg-paper border border-rule text-sm font-mono text-ink text-center" +
    " focus:outline-none focus:border-blush transition-colors";

  // Finish screen
  if (showFinish) {
    return (
      <div className="fixed inset-0 z-50 bg-paper flex flex-col">
        {showStamp && <SuccessStamp text="SAVED" onDone={handleStampDone} />}
        <div className="flex items-center justify-between px-5 py-3 border-b border-rule">
          <button
            onClick={() => setShowFinish(false)}
            className="text-sm text-faded active:text-ink"
          >
            Back
          </button>
          <span className="text-sm font-semibold italic">Finish Workout</span>
          <div className="w-12" />
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="bg-card border-l-2 border-blush p-4 space-y-4">
            <h3 className="text-sm font-semibold">{plan.title}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-paper p-4 text-center">
                <div className="text-2xl font-mono font-bold text-blush">{totalSetsCompleted}</div>
                <div className="text-[9px] font-mono text-faded uppercase tracking-[0.15em] mt-1">
                  Sets Done
                </div>
              </div>
              <div className="bg-paper p-4 text-center">
                <div className="text-2xl font-mono font-bold text-blush">{formatElapsed(elapsed)}</div>
                <div className="text-[9px] font-mono text-faded uppercase tracking-[0.15em] mt-1">
                  Duration
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="text-[9px] font-mono text-faded uppercase tracking-[0.15em] mb-1 block">
              Duration (min) — blank uses timer
            </label>
            <input
              type="number"
              inputMode="numeric"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder={String(Math.round(elapsed / 60) || "")}
              className="w-full px-4 py-3 bg-card border border-rule text-sm font-mono
                placeholder:text-faded/30 focus:outline-none focus:border-blush transition-colors"
            />
          </div>

          <div>
            <label className="text-[9px] font-mono text-faded uppercase tracking-[0.15em] mb-2 block">Rating</label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setRating(rating === n ? 0 : n)}
                  className={`flex-1 py-3 text-sm font-mono font-medium transition-colors border ${
                    n <= rating
                      ? "bg-blush/10 border-blush text-blush"
                      : "border-rule text-faded active:border-blush/40"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[9px] font-mono text-faded uppercase tracking-[0.15em] mb-1 block">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="How did it feel?"
              rows={3}
              className="w-full px-4 py-3 bg-card border border-rule text-sm
                placeholder:text-faded/40 placeholder:italic
                focus:outline-none focus:border-blush transition-colors resize-none"
            />
          </div>
        </div>

        <div className="p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] border-t border-rule bg-card">
          <button
            onClick={handleSave}
            disabled={saving || totalSetsCompleted === 0}
            className="w-full py-3.5 bg-blush text-white text-sm font-semibold
              active:scale-[0.97] transition-transform duration-75 disabled:opacity-30"
          >
            {saving
              ? "Saving..."
              : totalSetsCompleted === 0
              ? "Complete at least one set"
              : `Save Session (${totalSetsCompleted} sets)`}
          </button>
        </div>
      </div>
    );
  }

  // Main logging screen
  return (
    <div className="fixed inset-0 z-50 bg-paper flex flex-col">
      <div className="px-5 py-3 border-b border-rule bg-card">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={onClose}
            className="text-sm text-faded active:text-ink"
          >
            Cancel
          </button>
          <span className="text-sm font-mono font-medium text-blush">{formatElapsed(elapsed)}</span>
          <button
            onClick={() => setShowFinish(true)}
            className="text-sm text-blush font-semibold active:opacity-70"
          >
            Finish
          </button>
        </div>

        <div className="h-[2px] bg-rule overflow-hidden">
          <div
            className="h-full bg-blush transition-all duration-300"
            style={{
              width: `${totalSets > 0 ? (totalSetsCompleted / totalSets) * 100 : 0}%`,
            }}
          />
        </div>
      </div>

      {/* Exercise tabs */}
      <div className="flex overflow-x-auto gap-1 px-5 py-2 border-b border-rule bg-card">
        {exerciseLogs.map((log, i) => {
          const done = log.sets.filter((s) => s.done).length;
          const total = log.sets.length;
          const allDone = done === total && total > 0;
          return (
            <button
              key={log.slug}
              onClick={() => setActiveIndex(i)}
              className={`shrink-0 px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                i === activeIndex
                  ? "bg-blush text-white"
                  : allDone
                  ? "bg-sage/10 text-sage border border-sage/30"
                  : done > 0
                  ? "bg-ocean/10 text-ocean border border-ocean/30"
                  : "bg-paper text-faded border border-rule"
              }`}
            >
              {log.name.length > 14 ? log.name.slice(0, 12) + "…" : log.name}
              {done > 0 && i !== activeIndex && (
                <span className="ml-1 opacity-70">
                  {done}/{total}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Current exercise */}
      {currentLog && (
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <h2 className="text-xl font-bold">{currentLog.name}</h2>
            <p className="text-[10px] font-mono text-faded tracking-[0.15em] uppercase">
              Target: {currentLog.targetSets}×{currentLog.targetReps}
              {currentLog.targetWeight ? ` @ ${currentLog.targetWeight}kg` : ""}
            </p>
          </div>

          <div className="space-y-2">
            {/* Column headers */}
            <div className="grid items-center gap-2" style={{
              gridTemplateColumns: "2rem 1fr 1fr 2.5rem",
            }}>
              <span className="text-[9px] font-mono text-faded text-center uppercase tracking-wider">Set</span>
              {currentLog.tracking === "weight_reps" && (
                <>
                  <span className="text-[9px] font-mono text-faded text-center uppercase tracking-wider">KG</span>
                  <span className="text-[9px] font-mono text-faded text-center uppercase tracking-wider">Reps</span>
                </>
              )}
              {currentLog.tracking === "reps_only" && (
                <>
                  <span className="text-[9px] font-mono text-faded text-center uppercase tracking-wider">Reps</span>
                  <span />
                </>
              )}
              {currentLog.tracking === "timed" && (
                <>
                  <span className="text-[9px] font-mono text-faded text-center uppercase tracking-wider">Sec</span>
                  <span />
                </>
              )}
              {currentLog.tracking === "distance" && (
                <>
                  <span className="text-[9px] font-mono text-faded text-center uppercase tracking-wider">KM</span>
                  <span />
                </>
              )}
              <span className="text-[9px] font-mono text-faded text-center uppercase tracking-wider">OK</span>
            </div>

            {currentLog.sets.map((set, si) => (
              <div
                key={si}
                className={`grid items-center gap-2 transition-opacity ${
                  set.done ? "opacity-50" : ""
                }`}
                style={{
                  gridTemplateColumns: "2rem 1fr 1fr 2.5rem",
                }}
              >
                <span className="text-xs font-mono text-faded text-center font-medium">
                  {si + 1}
                </span>

                {currentLog.tracking === "weight_reps" && (
                  <>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={set.weight}
                      onChange={(e) =>
                        handleSetChange(activeIndex, si, "weight", e.target.value)
                      }
                      placeholder={currentLog.targetWeight ? String(currentLog.targetWeight) : "0"}
                      className={inputClass}
                    />
                    <input
                      type="number"
                      inputMode="numeric"
                      value={set.reps}
                      onChange={(e) =>
                        handleSetChange(activeIndex, si, "reps", e.target.value)
                      }
                      placeholder={currentLog.targetReps ? String(currentLog.targetReps) : "0"}
                      className={inputClass}
                    />
                  </>
                )}
                {currentLog.tracking === "reps_only" && (
                  <>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={set.reps}
                      onChange={(e) =>
                        handleSetChange(activeIndex, si, "reps", e.target.value)
                      }
                      placeholder={currentLog.targetReps ? String(currentLog.targetReps) : "0"}
                      className={inputClass}
                    />
                    <span />
                  </>
                )}
                {currentLog.tracking === "timed" && (
                  <>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={set.duration}
                      onChange={(e) =>
                        handleSetChange(activeIndex, si, "duration", e.target.value)
                      }
                      placeholder="0"
                      className={inputClass}
                    />
                    <span />
                  </>
                )}
                {currentLog.tracking === "distance" && (
                  <>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={set.distance}
                      onChange={(e) =>
                        handleSetChange(activeIndex, si, "distance", e.target.value)
                      }
                      placeholder="0"
                      className={inputClass}
                    />
                    <span />
                  </>
                )}

                <button
                  onClick={() => handleToggleDone(activeIndex, si)}
                  className={`w-8 h-8 border flex items-center justify-center text-sm transition-colors mx-auto ${
                    set.done
                      ? "bg-sage/15 border-sage text-sage"
                      : "border-rule text-rule active:border-blush/40"
                  }`}
                >
                  {set.done ? "✓" : ""}
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => handleAddSet(activeIndex)}
              className="flex-1 py-2.5 border border-dashed border-rule text-xs
                italic text-faded active:bg-card transition-colors"
            >
              + Add Set
            </button>
            {currentLog.sets.length > 1 && (
              <button
                onClick={() => handleRemoveSet(activeIndex, currentLog.sets.length - 1)}
                className="px-4 py-2.5 border border-dashed border-rule text-xs
                  text-faded hover:text-blush active:bg-card transition-colors"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      )}

      <div className="p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] border-t border-rule bg-card flex gap-2">
        <button
          onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
          disabled={activeIndex === 0}
          className="flex-1 py-3 border border-rule text-sm font-medium
            text-faded active:bg-paper active:scale-[0.98] transition-all duration-75 disabled:opacity-30"
        >
          Previous
        </button>
        {activeIndex < exerciseLogs.length - 1 ? (
          <button
            onClick={() => setActiveIndex((i) => Math.min(exerciseLogs.length - 1, i + 1))}
            className="flex-1 py-3 bg-blush text-white text-sm font-medium
              active:scale-[0.97] transition-transform duration-75"
          >
            Next
          </button>
        ) : (
          <button
            onClick={() => setShowFinish(true)}
            className="flex-1 py-3 bg-blush text-white text-sm font-medium
              active:scale-[0.97] transition-transform duration-75"
          >
            Finish
          </button>
        )}
      </div>
    </div>
  );
}
