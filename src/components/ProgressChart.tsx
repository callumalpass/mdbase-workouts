import { useState, useMemo } from "react";
import type { ExerciseHistoryEntry, TrackingType } from "../lib/types";

interface Props {
  entries: ExerciseHistoryEntry[];
  tracking: TrackingType;
}

interface DataPoint {
  date: string;
  value: number;
  e1rm?: number;
  label: string;
}

function extractDataPoints(entries: ExerciseHistoryEntry[], tracking: TrackingType): DataPoint[] {
  // Group entries by date (use first 10 chars), take best value per date
  const byDate = new Map<string, DataPoint>();

  // Entries come in desc order, reverse for chronological
  const sorted = [...entries].reverse();

  for (const entry of sorted) {
    const dateKey = entry.date.slice(0, 10);

    for (const set of entry.sets) {
      let value = 0;
      let e1rm: number | undefined;
      let label = "";

      if (tracking === "weight_reps") {
        const w = set.weight ?? 0;
        const r = set.reps ?? 0;
        if (w <= 0) continue;
        value = w;
        e1rm = w * (1 + r / 30);
        label = `${w}kg x${r}`;
      } else if (tracking === "reps_only") {
        value = set.reps ?? 0;
        if (value <= 0) continue;
        label = `${value} reps`;
      } else if (tracking === "timed") {
        value = set.duration_seconds ?? 0;
        if (value <= 0) continue;
        label = `${value}s`;
      } else if (tracking === "distance") {
        value = set.distance ?? 0;
        if (value <= 0) continue;
        label = `${value}km`;
      }

      const existing = byDate.get(dateKey);
      if (!existing || value > existing.value) {
        byDate.set(dateKey, { date: dateKey, value, e1rm, label });
      }
    }
  }

  return Array.from(byDate.values());
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function ProgressChart({ entries, tracking }: Props) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string } | null>(null);

  const points = useMemo(() => extractDataPoints(entries, tracking), [entries, tracking]);

  if (points.length < 3) {
    return (
      <p className="text-sm italic text-faded text-center py-6">
        Not enough data (need 3+ sessions)
      </p>
    );
  }

  const W = 100;
  const H = 45;
  const PAD_X = 2;
  const PAD_TOP = 4;
  const PAD_BOT = 8;

  const values = points.map((p) => p.value);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = maxV - minV || 1;

  const scaleX = (i: number) => PAD_X + (i / (points.length - 1)) * (W - 2 * PAD_X);
  const scaleY = (v: number) => PAD_TOP + (1 - (v - minV) / range) * (H - PAD_TOP - PAD_BOT);

  const linePoints = points.map((p, i) => `${scaleX(i)},${scaleY(p.value)}`).join(" ");

  // Fill polygon: line + bottom edge
  const fillPoints = [
    `${scaleX(0)},${H - PAD_BOT}`,
    ...points.map((p, i) => `${scaleX(i)},${scaleY(p.value)}`),
    `${scaleX(points.length - 1)},${H - PAD_BOT}`,
  ].join(" ");

  // e1RM line (weight_reps only)
  const e1rmLine =
    tracking === "weight_reps"
      ? points.map((p, i) => `${scaleX(i)},${scaleY(p.e1rm ?? p.value)}`).join(" ")
      : null;

  // Sparse x-axis labels (first, middle, last)
  const labelIndices = [0, Math.floor(points.length / 2), points.length - 1];

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: 180 }}
        preserveAspectRatio="none"
        onTouchStart={() => setTooltip(null)}
      >
        {/* Fill under curve */}
        <polygon points={fillPoints} fill="#E05170" opacity="0.1" />

        {/* e1RM dashed line */}
        {e1rmLine && (
          <polyline
            points={e1rmLine}
            fill="none"
            stroke="#5A9668"
            strokeWidth="0.3"
            strokeDasharray="1 0.8"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* Main line */}
        <polyline
          points={linePoints}
          fill="none"
          stroke="#E05170"
          strokeWidth="0.5"
          vectorEffect="non-scaling-stroke"
        />

        {/* Data points */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={scaleX(i)}
            cy={scaleY(p.value)}
            r="0.8"
            fill="#E05170"
            className="cursor-pointer"
            onPointerDown={(e) => {
              const svg = e.currentTarget.ownerSVGElement!;
              const rect = svg.getBoundingClientRect();
              const pxX = (scaleX(i) / W) * rect.width;
              const pxY = (scaleY(p.value) / H) * rect.height;
              setTooltip({ x: pxX, y: pxY, label: p.label });
            }}
          />
        ))}

        {/* X-axis labels */}
        {labelIndices.map((idx) => (
          <text
            key={idx}
            x={scaleX(idx)}
            y={H - 1}
            textAnchor="middle"
            fontSize="2.5"
            fill="#918A82"
            style={{ fontFamily: "'IBM Plex Mono', monospace" }}
          >
            {formatDateLabel(points[idx].date)}
          </text>
        ))}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute bg-ink text-paper text-[10px] font-mono px-2 py-1 pointer-events-none -translate-x-1/2 -translate-y-full"
          style={{ left: tooltip.x, top: tooltip.y - 4 }}
        >
          {tooltip.label}
        </div>
      )}

      {/* Legend for e1RM */}
      {tracking === "weight_reps" && (
        <div className="flex items-center gap-3 mt-1">
          <div className="flex items-center gap-1">
            <span className="w-3 h-[2px] bg-blush inline-block" />
            <span className="text-[11px] font-mono text-faded uppercase tracking-wider">Weight</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3 h-[2px] bg-sage inline-block" style={{ borderTop: "1px dashed" }} />
            <span className="text-[11px] font-mono text-faded uppercase tracking-wider">Est. 1RM</span>
          </div>
        </div>
      )}
    </div>
  );
}
