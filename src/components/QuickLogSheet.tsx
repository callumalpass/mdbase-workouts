import { useState, useEffect, useCallback } from "react";
import type { CreateQuickLogInput, Exercise } from "../lib/types";
import { api } from "../lib/api";
import { pathToSlug, parseWikilink } from "../lib/utils";
import { useLastUsed } from "../hooks/useLocalStorage";
import { useDragToDismiss } from "../hooks/useDragToDismiss";
import { useRequestOptions } from "../hooks/useRequestOptions";
import ExercisePicker from "./ExercisePicker";
import SetInput from "./SetInput";
import SuccessStamp from "./SuccessStamp";

interface Props {
  open: boolean;
  onClose: () => void;
  onLogged: () => void;
}

export default function QuickLogSheet({ open, onClose, onLogged }: Props) {
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [duration, setDuration] = useState("");
  const [distance, setDistance] = useState("");
  const [saving, setSaving] = useState(false);
  const [showStamp, setShowStamp] = useState(false);
  const [error, setError] = useState("");
  const { getLastUsed, saveLastUsed } = useLastUsed();
  const [recentSlugs, setRecentSlugs] = useState<string[]>([]);
  const requestOptions = useRequestOptions(20_000, open);

  const handleClose = useCallback(() => {
    setExercise(null);
    setWeight("");
    setReps("");
    setDuration("");
    setDistance("");
    setError("");
    onClose();
  }, [onClose]);

  const { style: dragStyle, dragHandleProps } = useDragToDismiss(handleClose);

  useEffect(() => {
    if (open) {
      const controller = new AbortController();
      api.quickLogs.list(50, { signal: controller.signal, timeoutMs: 10_000 }).then((logs) => {
        const seen = new Set<string>();
        const slugs: string[] = [];
        for (const log of logs) {
          const slug = parseWikilink(log.exercise);
          if (!seen.has(slug)) {
            seen.add(slug);
            slugs.push(slug);
          }
        }
        if (!controller.signal.aborted) setRecentSlugs(slugs);
      }).catch(() => {});
      return () => controller.abort("Quick log sheet closed");
    }
  }, [open]);

  if (!open && !showStamp) return null;

  const handleSelectExercise = (ex: Exercise) => {
    setExercise(ex);
    setError("");
    const slug = pathToSlug(ex.path);
    const last = getLastUsed(slug);
    if (last.weight != null) setWeight(String(last.weight));
    if (last.reps != null) setReps(String(last.reps));
  };

  const handleLog = async () => {
    if (!exercise) return;
    if (![reps, weight, duration, distance].some((value) => value.trim())) {
      setError("Add at least one set value before logging.");
      return;
    }
    setSaving(true);
    setError("");
    const slug = pathToSlug(exercise.path);
    const data: CreateQuickLogInput = { exercise: slug };
    if (reps) data.reps = Number(reps);
    if (weight) data.weight = Number(weight);
    if (duration) data.duration_seconds = Number(duration);
    if (distance) data.distance = Number(distance);

    try {
      await api.quickLogs.create(data, requestOptions());
      saveLastUsed(slug, {
        ...(weight ? { weight: Number(weight) } : {}),
        ...(reps ? { reps: Number(reps) } : {}),
      });
      setShowStamp(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not log this set.";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleStampDone = () => {
    setShowStamp(false);
    handleClose();
    onLogged();
  };

  return (
    <>
      {showStamp && <SuccessStamp text="LOGGED" onDone={handleStampDone} />}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-ink/30" onClick={handleClose} />

          <div
            className="relative w-full max-w-lg bg-paper border-t-2 border-blush p-5 pb-8
              animate-[slideUp_0.2s_ease-out] max-h-[85dvh] overflow-y-auto"
            style={dragStyle}
          >
            <div className="w-10 h-[2px] bg-rule mx-auto mb-4 touch-none" {...dragHandleProps} />

            {!exercise ? (
              <>
                <h2 className="text-lg font-semibold mb-3">Quick Log</h2>
                <ExercisePicker onSelect={handleSelectExercise} recentSlugs={recentSlugs} />
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold mb-1">{exercise.name}</h2>
                <p className="text-[10px] font-mono text-faded tracking-wider mb-4">
                  {exercise.muscle_groups?.join(" · ")}
                </p>

                <SetInput
                  tracking={exercise.tracking}
                  weight={weight}
                  reps={reps}
                  duration={duration}
                  distance={distance}
                  onWeightChange={setWeight}
                  onRepsChange={setReps}
                  onDurationChange={setDuration}
                  onDistanceChange={setDistance}
                />

                {error && (
                  <p className="mt-4 text-sm text-blush">{error}</p>
                )}

                <div className="flex gap-2 mt-5">
                  <button
                    onClick={() => setExercise(null)}
                    className="flex-1 py-3 border border-rule text-sm font-medium
                      text-faded active:bg-card active:scale-[0.98] transition-all duration-75"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleLog}
                    disabled={saving}
                    className="flex-1 py-3 bg-blush text-paper text-sm font-medium
                      active:scale-[0.97] transition-transform duration-75 disabled:opacity-40"
                  >
                    {saving ? "Logging..." : "Log"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
