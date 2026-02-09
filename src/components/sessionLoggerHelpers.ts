import type { SetData } from "../lib/types";

export interface SetEntry {
  weight: string;
  reps: string;
  duration: string;
  distance: string;
  done: boolean;
  weightTouched: boolean;
}

export function emptySet(): SetEntry {
  return { weight: "", reps: "", duration: "", distance: "", done: false, weightTouched: false };
}

export function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function formatLastSets(sets: SetData[]): string {
  if (!sets.length) return "";

  const groups: { weight: number | undefined; reps: number[] }[] = [];
  for (const set of sets) {
    const last = groups[groups.length - 1];
    if (last && last.weight === set.weight) {
      last.reps.push(set.reps ?? 0);
    } else {
      groups.push({ weight: set.weight, reps: [set.reps ?? 0] });
    }
  }

  return groups
    .map((group) =>
      group.weight != null
        ? `${group.weight}kg × ${group.reps.join(", ")}`
        : group.reps.join(", ")
    )
    .join(" / ");
}
