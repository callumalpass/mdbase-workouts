import { useState } from "react";
import { useExerciseDetail } from "../hooks/useExerciseDetail";
import { formatDate, formatSet, formatTime } from "../lib/utils";
import { api } from "../lib/api";
import type { TrackingType, ExerciseHistoryEntry } from "../lib/types";

interface Props {
  slug: string;
  onBack: () => void;
}

const EQUIPMENT_OPTIONS = ["barbell", "dumbbell", "cable", "machine", "bodyweight", "kettlebell", "band"];
const TRACKING_OPTIONS: { value: TrackingType; label: string }[] = [
  { value: "weight_reps", label: "wt × rep" },
  { value: "reps_only", label: "reps" },
  { value: "timed", label: "timed" },
  { value: "distance", label: "dist" },
];

export default function ExerciseDetailView({ slug, onBack }: Props) {
  const { data, loading, refresh } = useExerciseDetail(slug);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEquipment, setEditEquipment] = useState("");
  const [editTracking, setEditTracking] = useState<TrackingType>("weight_reps");
  const [editMuscleGroups, setEditMuscleGroups] = useState("");
  const [saving, setSaving] = useState(false);

  if (loading || !data) {
    return (
      <div className="p-5 pb-20">
        <button onClick={onBack} className="text-xs font-mono uppercase tracking-[0.15em] text-blush mb-6">
          &larr; Back
        </button>
        <p className="text-sm italic text-faded text-center py-8">Loading...</p>
      </div>
    );
  }

  const { exercise, stats, entries } = data;

  function startEdit() {
    setEditName(exercise.name);
    setEditEquipment(exercise.equipment);
    setEditTracking(exercise.tracking);
    setEditMuscleGroups((exercise.muscle_groups || []).join(", "));
    setEditing(true);
  }

  async function saveEdit() {
    setSaving(true);
    try {
      await api.exercises.update(slug, {
        name: editName,
        equipment: editEquipment,
        tracking: editTracking,
        muscle_groups: editMuscleGroups.split(",").map((s) => s.trim()).filter(Boolean),
      });
      setEditing(false);
      refresh();
    } finally {
      setSaving(false);
    }
  }

  const trackingLabels: Record<string, string> = {
    weight_reps: "wt × rep",
    reps_only: "reps",
    timed: "timed",
    distance: "dist",
  };

  function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m >= 60) {
      const h = Math.floor(m / 60);
      const rm = m % 60;
      return `${h}h ${rm}m`;
    }
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }

  function renderStats() {
    if (stats.totalEntries === 0) {
      return (
        <p className="text-sm italic text-faded text-center py-6">
          No workout history yet
        </p>
      );
    }

    const items: { label: string; value: string }[] = [
      { label: "Total entries", value: String(stats.totalEntries) },
    ];

    if (stats.firstLogged) {
      items.push({ label: "First logged", value: formatDate(stats.firstLogged) });
    }
    if (stats.lastLogged) {
      items.push({ label: "Last logged", value: formatDate(stats.lastLogged) });
    }

    if (exercise.tracking === "weight_reps") {
      if (stats.prWeight) items.push({ label: "PR weight", value: `${stats.prWeight}kg` });
      if (stats.prSet) items.push({ label: "Best set", value: stats.prSet });
      if (stats.totalVolume) items.push({ label: "Total volume", value: `${stats.totalVolume.toLocaleString()}kg` });
      if (stats.avgSetsPerSession) items.push({ label: "Avg sets / session", value: String(stats.avgSetsPerSession) });
    } else if (exercise.tracking === "reps_only") {
      if (stats.maxReps) items.push({ label: "Max reps", value: String(stats.maxReps) });
      if (stats.totalReps) items.push({ label: "Total reps", value: String(stats.totalReps) });
    } else if (exercise.tracking === "timed") {
      if (stats.longestDuration) items.push({ label: "Longest", value: formatDuration(stats.longestDuration) });
      if (stats.totalDuration) items.push({ label: "Total time", value: formatDuration(stats.totalDuration) });
    } else if (exercise.tracking === "distance") {
      if (stats.longestDistance) items.push({ label: "Longest", value: `${stats.longestDistance}km` });
      if (stats.totalDistance) items.push({ label: "Total distance", value: `${stats.totalDistance}km` });
    }

    return (
      <div className="grid grid-cols-2 gap-3">
        {items.map((item) => (
          <div key={item.label} className="bg-card border-l-2 border-blush p-4">
            <div className="text-xl font-mono text-ink">{item.value}</div>
            <div className="text-[9px] font-mono text-faded uppercase tracking-[0.15em] mt-1">
              {item.label}
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderEntry(entry: ExerciseHistoryEntry, i: number) {
    const borderColor = entry.source === "session" ? "border-sage" : "border-ocean";
    const badgeColor = entry.source === "session" ? "text-sage" : "text-ocean";

    return (
      <div key={i} className={`bg-card border-l-2 ${borderColor} p-4`}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold">{formatDate(entry.date)}</span>
          <div className="flex items-center gap-2">
            <span className={`text-[9px] font-mono uppercase tracking-[0.15em] ${badgeColor}`}>
              {entry.source}
            </span>
            <span className="text-[10px] font-mono text-faded">
              {formatTime(entry.date)}
            </span>
          </div>
        </div>
        <div className="text-xs font-mono text-faded">
          {entry.sets.map((s) => formatSet(s)).join(" / ")}
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 pb-20 space-y-6">
      {/* Header */}
      <div>
        <button onClick={onBack} className="text-xs font-mono uppercase tracking-[0.15em] text-blush mb-4 block">
          &larr; Back
        </button>
        <h1 className="text-4xl font-bold tracking-tight">{exercise.name}</h1>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[9px] font-mono uppercase tracking-[0.15em] text-faded px-1.5 py-0.5 bg-paper">
            {exercise.equipment}
          </span>
          <span className="text-[9px] font-mono uppercase tracking-[0.15em] text-blush px-1.5 py-0.5 bg-paper">
            {trackingLabels[exercise.tracking] || exercise.tracking}
          </span>
        </div>
        {exercise.muscle_groups?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {exercise.muscle_groups.map((g: string) => (
              <span
                key={g}
                className="text-[9px] font-mono px-1.5 py-0.5 bg-paper text-faded uppercase tracking-wider"
              >
                {g}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Stats */}
      <div>
        <h2 className="text-xs font-mono uppercase tracking-[0.15em] text-faded mb-3">Stats</h2>
        {renderStats()}
      </div>

      {/* Edit Section */}
      <div>
        <h2 className="text-xs font-mono uppercase tracking-[0.15em] text-faded mb-3">Details</h2>
        {editing ? (
          <div className="space-y-3">
            <div>
              <label className="text-[9px] font-mono uppercase tracking-[0.15em] text-faded mb-1 block">
                Name
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-3 py-2 bg-paper border border-rule text-sm
                  focus:outline-none focus:border-blush transition-colors"
              />
            </div>

            <div>
              <label className="text-[9px] font-mono uppercase tracking-[0.15em] text-faded mb-1 block">
                Equipment
              </label>
              <div className="flex flex-wrap gap-1">
                {EQUIPMENT_OPTIONS.map((eq) => (
                  <button
                    key={eq}
                    onClick={() => setEditEquipment(eq)}
                    className={`text-[9px] font-mono uppercase tracking-[0.15em] px-2 py-1 transition-colors ${
                      editEquipment === eq
                        ? "bg-blush text-white"
                        : "bg-paper text-faded border border-rule"
                    }`}
                  >
                    {eq}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[9px] font-mono uppercase tracking-[0.15em] text-faded mb-1 block">
                Tracking
              </label>
              <div className="flex flex-wrap gap-1">
                {TRACKING_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setEditTracking(opt.value)}
                    className={`text-[9px] font-mono uppercase tracking-[0.15em] px-2 py-1 transition-colors ${
                      editTracking === opt.value
                        ? "bg-blush text-white"
                        : "bg-paper text-faded border border-rule"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[9px] font-mono uppercase tracking-[0.15em] text-faded mb-1 block">
                Muscle groups (comma-separated)
              </label>
              <input
                type="text"
                value={editMuscleGroups}
                onChange={(e) => setEditMuscleGroups(e.target.value)}
                className="w-full px-3 py-2 bg-paper border border-rule text-sm
                  focus:outline-none focus:border-blush transition-colors"
                placeholder="chest, shoulders, triceps"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={saveEdit}
                disabled={saving}
                className="px-4 py-2 bg-blush text-white text-xs font-mono uppercase tracking-[0.15em]
                  disabled:opacity-50 transition-opacity"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="px-4 py-2 bg-paper text-faded text-xs font-mono uppercase tracking-[0.15em]
                  border border-rule"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={startEdit}
            className="text-xs font-mono uppercase tracking-[0.15em] text-blush border border-dashed border-rule px-4 py-2
              active:bg-card transition-colors"
          >
            Edit exercise
          </button>
        )}
      </div>

      {/* History Timeline */}
      <div>
        <h2 className="text-xs font-mono uppercase tracking-[0.15em] text-faded mb-3">
          History
          {entries.length > 0 && (
            <span className="ml-2 text-ink">{entries.length}</span>
          )}
        </h2>
        {entries.length === 0 ? (
          <p className="text-sm italic text-faded text-center py-6">
            No entries yet
          </p>
        ) : (
          <div className="space-y-3">
            {entries.map((entry, i) => renderEntry(entry, i))}
          </div>
        )}
      </div>
    </div>
  );
}
