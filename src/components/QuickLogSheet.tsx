import { useState, useEffect, useCallback } from "react";
import type { Exercise } from "../lib/types";
import { api } from "../lib/api";
import { pathToSlug, parseWikilink } from "../lib/utils";
import { useLastUsed } from "../hooks/useLocalStorage";
import { useDragToDismiss } from "../hooks/useDragToDismiss";
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
  const { getLastUsed, saveLastUsed } = useLastUsed();
  const [recentSlugs, setRecentSlugs] = useState<string[]>([]);

  const handleClose = useCallback(() => {
    setExercise(null);
    setWeight("");
    setReps("");
    setDuration("");
    setDistance("");
    onClose();
  }, [onClose]);

  const { style: dragStyle, dragHandleProps } = useDragToDismiss(handleClose);

  useEffect(() => {
    if (open) {
      api.quickLogs.list(50).then((logs) => {
        const seen = new Set<string>();
        const slugs: string[] = [];
        for (const log of logs) {
          const slug = parseWikilink(log.exercise);
          if (!seen.has(slug)) {
            seen.add(slug);
            slugs.push(slug);
          }
        }
        setRecentSlugs(slugs);
      });
    }
  }, [open]);

  if (!open && !showStamp) return null;

  const handleSelectExercise = (ex: Exercise) => {
    setExercise(ex);
    const slug = pathToSlug(ex.path);
    const last = getLastUsed(slug);
    if (last.weight != null) setWeight(String(last.weight));
    if (last.reps != null) setReps(String(last.reps));
  };

  const handleLog = async () => {
    if (!exercise) return;
    setSaving(true);
    const slug = pathToSlug(exercise.path);
    const data: Record<string, unknown> = { exercise: slug };
    if (reps) data.reps = Number(reps);
    if (weight) data.weight = Number(weight);
    if (duration) data.duration_seconds = Number(duration);
    if (distance) data.distance = Number(distance);

    try {
      await api.quickLogs.create(data);
      saveLastUsed(slug, {
        ...(weight ? { weight: Number(weight) } : {}),
        ...(reps ? { reps: Number(reps) } : {}),
      });
      setShowStamp(true);
    } catch (err) {
      console.error("Failed to log:", err);
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
                    className="flex-1 py-3 bg-blush text-white text-sm font-medium
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
