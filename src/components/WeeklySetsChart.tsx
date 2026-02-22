import { useEffect, useRef, useState } from "react";
import type { WeeklySetEntry } from "../lib/types";

const COL_W = 24;
const GAP = 2;
const CHART_H = 72;

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function getMonth(dateStr: string): number {
  return Number(dateStr.split("-")[1]);
}

function getYear(dateStr: string): number {
  return Number(dateStr.split("-")[0]);
}

function getMonthLabel(dateStr: string): string {
  return MONTHS[getMonth(dateStr) - 1];
}

interface Props {
  weeks: WeeklySetEntry[];
  targetSets: number;
}

export default function WeeklySetsChart({ weeks, targetSets }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [weeks.length]);

  if (weeks.length === 0) return null;

  const maxSets = Math.max(...weeks.map((w) => w.sets), 1);
  const totalWidth = weeks.length * (COL_W + GAP) - GAP;
  const targetLineTop = Math.max(0, CHART_H * (1 - targetSets / maxSets));

  return (
    <div
      ref={scrollRef}
      className="overflow-x-auto -mx-5"
      style={{ scrollbarWidth: "none" }}
    >
      <div style={{ paddingLeft: 20, paddingRight: 20, width: totalWidth + 40 }}>
        {/* Count label row — always takes up 16px so bars don't shift */}
        <div className="flex" style={{ height: 16, gap: GAP }}>
          {weeks.map((week) => (
            <div
              key={week.weekStart}
              className="flex items-center justify-center"
              style={{ width: COL_W, flexShrink: 0 }}
            >
              {selectedWeek === week.weekStart && (
                <span className="text-[9px] font-mono text-sage">{week.sets}</span>
              )}
            </div>
          ))}
        </div>

        {/* Bars — full column height is tappable */}
        <div className="relative flex" style={{ height: CHART_H, gap: GAP }}>
          {/* 80 sets/week target line */}
          <div
            className="absolute left-0 right-0 pointer-events-none"
            style={{ top: targetLineTop, borderTop: "1px dashed rgba(145,138,130,0.5)" }}
          />
          {weeks.map((week, i) => {
            const height =
              week.sets > 0
                ? Math.max(3, Math.round((week.sets / maxSets) * CHART_H))
                : 1;
            const isSelected = selectedWeek === week.weekStart;
            const isNewYear = i > 0 && getYear(week.weekStart) !== getYear(weeks[i - 1].weekStart);
            return (
              <div
                key={week.weekStart}
                onClick={() =>
                  setSelectedWeek((s) => (s === week.weekStart ? null : week.weekStart))
                }
                className="flex flex-col items-center justify-end cursor-pointer"
                style={{
                  width: COL_W,
                  height: CHART_H,
                  flexShrink: 0,
                  boxShadow: isNewYear ? "-1px 0 0 0 rgba(145,138,130,0.5)" : undefined,
                }}
              >
                <div
                  style={{ width: COL_W, height }}
                  className={
                    isSelected
                      ? "bg-sage"
                      : week.isCurrentWeek
                      ? "bg-sage"
                      : week.sets === 0
                      ? "bg-rule"
                      : "bg-sage/30"
                  }
                />
              </div>
            );
          })}
        </div>

        {/* Month labels */}
        <div className="flex" style={{ gap: GAP }}>
          {weeks.map((week, i) => {
            const showMonthLabel =
              i === 0 || getMonth(week.weekStart) !== getMonth(weeks[i - 1].weekStart);
            const isNewYear = i > 0 && getYear(week.weekStart) !== getYear(weeks[i - 1].weekStart);
            return (
              <div
                key={week.weekStart}
                className="text-[8px] font-mono text-faded pt-1 overflow-visible whitespace-nowrap"
                style={{
                  width: COL_W,
                  flexShrink: 0,
                  boxShadow: isNewYear ? "-1px 0 0 0 rgba(145,138,130,0.5)" : undefined,
                }}
              >
                {isNewYear
                  ? getYear(week.weekStart)
                  : showMonthLabel
                  ? getMonthLabel(week.weekStart)
                  : ""}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
