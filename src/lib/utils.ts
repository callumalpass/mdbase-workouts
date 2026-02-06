/** Extract the slug from a wikilink like [[exercises/bench-press]] */
export function parseWikilink(link: string): string {
  const match = link.match(/\[\[(?:.*\/)?([^\]|]+)\]\]/);
  return match ? match[1] : link;
}

/** Extract full path from wikilink */
export function wikilinkPath(link: string): string {
  const match = link.match(/\[\[([^\]|]+)\]\]/);
  return match ? match[1] : link;
}

/** Format ISO date to readable string */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** Format ISO datetime to time string */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** Get the slug from a file path like exercises/bench-press.md */
export function pathToSlug(path: string): string {
  return path.replace(/^.*\//, "").replace(/\.md$/, "");
}

/** Humanise a slug: bench-press → Bench Press */
export function slugToName(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Format set data for display */
export function formatSet(set: {
  reps?: number;
  weight?: number;
  duration_seconds?: number;
  distance?: number;
}): string {
  if (set.weight != null && set.reps != null) return `${set.weight}kg × ${set.reps}`;
  if (set.reps != null) return `${set.reps} reps`;
  if (set.duration_seconds != null) {
    const m = Math.floor(set.duration_seconds / 60);
    const s = set.duration_seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }
  if (set.distance != null) return `${set.distance}km`;
  return "—";
}
