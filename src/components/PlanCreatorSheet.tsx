import { useState, useCallback } from "react";
import type { Exercise } from "../lib/types";
import { api } from "../lib/api";
import { pathToSlug } from "../lib/utils";
import { useDragToDismiss } from "../hooks/useDragToDismiss";
import ExercisePicker from "./ExercisePicker";
import SuccessStamp from "./SuccessStamp";

interface PlanExerciseEntry {
  exercise: Exercise;
  target_sets: string;
  target_reps: string;
  target_weight: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

type Step = "details" | "exercises" | "picking";

export default function PlanCreatorSheet({ open, onClose, onCreated }: Props) {
  const [step, setStep] = useState<Step>("details");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [exercises, setExercises] = useState<PlanExerciseEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [showStamp, setShowStamp] = useState(false);

  const handleClose = useCallback(() => {
    setStep("details");
    setTitle("");
    setDate(new Date().toISOString().slice(0, 10));
    setExercises([]);
    onClose();
  }, [onClose]);

  const { style: dragStyle, dragHandleProps } = useDragToDismiss(handleClose);

  if (!open && !showStamp) return null;

  const handleAddExercise = (ex: Exercise) => {
    setExercises((prev) => [
      ...prev,
      { exercise: ex, target_sets: "3", target_reps: "10", target_weight: "" },
    ]);
    setStep("exercises");
  };

  const handleRemoveExercise = (index: number) => {
    setExercises((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateExercise = (
    index: number,
    field: "target_sets" | "target_reps" | "target_weight",
    value: string
  ) => {
    setExercises((prev) =>
      prev.map((e, i) => (i === index ? { ...e, [field]: value } : e))
    );
  };

  const handleMoveExercise = (index: number, direction: -1 | 1) => {
    const next = index + direction;
    if (next < 0 || next >= exercises.length) return;
    setExercises((prev) => {
      const copy = [...prev];
      [copy[index], copy[next]] = [copy[next], copy[index]];
      return copy;
    });
  };

  const handleSave = async () => {
    if (!title.trim() || exercises.length === 0) return;
    setSaving(true);
    try {
      await api.plans.create({
        date,
        title: title.trim(),
        exercises: exercises.map((e) => ({
          exercise: pathToSlug(e.exercise.path),
          ...(e.target_sets && { target_sets: Number(e.target_sets) }),
          ...(e.target_reps && { target_reps: Number(e.target_reps) }),
          ...(e.target_weight && { target_weight: Number(e.target_weight) }),
        })),
      });
      setShowStamp(true);
    } catch (err) {
      console.error("Failed to create plan:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleStampDone = () => {
    setShowStamp(false);
    handleClose();
    onCreated();
  };

  const inputClass =
    "w-full px-4 py-3 bg-paper border border-rule text-sm" +
    " placeholder:text-faded/50 placeholder:italic focus:outline-none focus:border-blush transition-colors";

  const smallInputClass =
    "w-full px-2 py-2.5 bg-paper border border-rule text-sm font-mono text-ink text-center" +
    " focus:outline-none focus:border-blush transition-colors";

  const canProceedToExercises = title.trim().length > 0;
  const canSave = title.trim().length > 0 && exercises.length > 0;

  return (
    <>
      {showStamp && <SuccessStamp text="CREATED" onDone={handleStampDone} />}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-ink/30" onClick={handleClose} />

          <div
            className="relative w-full max-w-lg bg-paper border-t-2 border-blush p-5 pb-8
              animate-[slideUp_0.2s_ease-out] max-h-[90dvh] overflow-y-auto"
            style={dragStyle}
          >
            <div className="w-10 h-[2px] bg-rule mx-auto mb-4 touch-none" {...dragHandleProps} />

            {/* Step indicator */}
            <div className="flex items-center gap-2 mb-5">
              <div
                className={`h-[2px] flex-1 transition-colors ${
                  step === "details" ? "bg-blush" : "bg-rule"
                }`}
              />
              <div
                className={`h-[2px] flex-1 transition-colors ${
                  step === "exercises" || step === "picking" ? "bg-blush" : "bg-rule"
                }`}
              />
            </div>

            {step === "details" && (
              <>
                <h2 className="text-lg font-semibold mb-4">New Plan</h2>

                <div className="space-y-3">
                  <div>
                    <label className="text-[9px] font-mono text-faded uppercase tracking-[0.15em] mb-1 block">Title</label>
                    <input
                      type="text"
                      placeholder="e.g. Push Day, Full Body"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      autoFocus
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="text-[9px] font-mono text-faded uppercase tracking-[0.15em] mb-1 block">Date</label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="flex gap-2 mt-5">
                  <button
                    onClick={handleClose}
                    className="flex-1 py-3 border border-rule text-sm font-medium
                      text-faded active:bg-card active:scale-[0.98] transition-all duration-75"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setStep(exercises.length > 0 ? "exercises" : "picking")}
                    disabled={!canProceedToExercises}
                    className="flex-1 py-3 bg-blush text-white text-sm font-medium
                      active:scale-[0.97] transition-transform duration-75 disabled:opacity-40"
                  >
                    {exercises.length > 0 ? "Edit Exercises" : "Add Exercises"}
                  </button>
                </div>
              </>
            )}

            {step === "picking" && (
              <>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold">Add Exercise</h2>
                  {exercises.length > 0 && (
                    <button
                      onClick={() => setStep("exercises")}
                      className="text-xs font-mono text-blush tracking-wider"
                    >
                      Done ({exercises.length})
                    </button>
                  )}
                </div>
                <ExercisePicker onSelect={handleAddExercise} />
              </>
            )}

            {step === "exercises" && (
              <>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold">
                    Exercises
                    <span className="text-faded font-normal ml-2 font-mono text-sm">{exercises.length}</span>
                  </h2>
                </div>

                {exercises.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm italic text-faded mb-2">No exercises yet</p>
                    <button
                      onClick={() => setStep("picking")}
                      className="text-sm text-blush font-medium"
                    >
                      Add your first exercise
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3 mb-3">
                    {exercises.map((entry, index) => (
                      <div
                        key={`${entry.exercise.path}-${index}`}
                        className="bg-card border-l-2 border-rule p-3 active:translate-y-px transition-transform"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div className="flex flex-col gap-0.5">
                              <button
                                onClick={() => handleMoveExercise(index, -1)}
                                disabled={index === 0}
                                className="text-faded text-[10px] font-mono leading-none disabled:opacity-20"
                              >
                                ▲
                              </button>
                              <button
                                onClick={() => handleMoveExercise(index, 1)}
                                disabled={index === exercises.length - 1}
                                className="text-faded text-[10px] font-mono leading-none disabled:opacity-20"
                              >
                                ▼
                              </button>
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">
                                {entry.exercise.name}
                              </div>
                              <div className="text-[9px] font-mono text-faded tracking-wider">
                                {entry.exercise.tracking?.replace("_", " ")}
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => handleRemoveExercise(index)}
                            className="text-faded hover:text-blush text-xs p-1 transition-colors"
                          >
                            ✕
                          </button>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-[9px] font-mono text-faded uppercase tracking-wider mb-0.5 block">Sets</label>
                            <input
                              type="number"
                              inputMode="numeric"
                              value={entry.target_sets}
                              onChange={(e) =>
                                handleUpdateExercise(index, "target_sets", e.target.value)
                              }
                              placeholder="3"
                              className={smallInputClass}
                            />
                          </div>
                          <div>
                            <label className="text-[9px] font-mono text-faded uppercase tracking-wider mb-0.5 block">Reps</label>
                            <input
                              type="number"
                              inputMode="numeric"
                              value={entry.target_reps}
                              onChange={(e) =>
                                handleUpdateExercise(index, "target_reps", e.target.value)
                              }
                              placeholder="10"
                              className={smallInputClass}
                            />
                          </div>
                          {(entry.exercise.tracking === "weight_reps" ||
                            !entry.exercise.tracking) && (
                            <div>
                              <label className="text-[9px] font-mono text-faded uppercase tracking-wider mb-0.5 block">
                                KG
                              </label>
                              <input
                                type="number"
                                inputMode="decimal"
                                value={entry.target_weight}
                                onChange={(e) =>
                                  handleUpdateExercise(index, "target_weight", e.target.value)
                                }
                                placeholder="—"
                                className={smallInputClass}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => setStep("picking")}
                  className="w-full py-3 border border-dashed border-rule text-sm
                    italic text-faded active:bg-card transition-colors mb-4"
                >
                  + Add Exercise
                </button>

                <div className="flex gap-2">
                  <button
                    onClick={() => setStep("details")}
                    className="flex-1 py-3 border border-rule text-sm font-medium
                      text-faded active:bg-card active:scale-[0.98] transition-all duration-75"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={!canSave || saving}
                    className="flex-1 py-3 bg-blush text-white text-sm font-medium
                      active:scale-[0.97] transition-transform duration-75 disabled:opacity-40"
                  >
                    {saving ? "Creating..." : "Create Plan"}
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
