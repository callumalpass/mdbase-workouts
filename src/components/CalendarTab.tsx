import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import type { Plan, QuickLog, Session } from "../lib/types";
import { useExercises } from "../hooks/useExercises";
import { formatSet, formatTime, parseWikilink, pathToSlug, slugToName } from "../lib/utils";
import PlanCard from "./PlanCard";
import SessionCard from "./SessionCard";
import SessionLoggerSheet from "./SessionLoggerSheet";
import ConfirmDialog from "./ConfirmDialog";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function keyFromDateLike(value: string): string {
  const dateOnlyMatch = value.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (dateOnlyMatch) return dateOnlyMatch[1];
  return toDateKey(new Date(value));
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function selectedDayLabel(day: string): string {
  const date = new Date(`${day}T00:00:00`);
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function CalendarTab() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [quickLogs, setQuickLogs] = useState<QuickLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const { allExercises } = useExercises();
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const loadCalendarData = useCallback(async () => {
    setLoading(true);
    try {
      const collected: Session[] = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const res = await api.sessions.list(100, offset);
        collected.push(...res.sessions);
        offset += res.sessions.length;
        hasMore = res.hasMore;
      }

      const allPlans = await api.plans.list();
      const allQuickLogs = await api.quickLogs.list(500);
      setSessions(collected);
      setPlans(allPlans);
      setQuickLogs(allQuickLogs);
      setLoading(false);
    } catch {
      setSessions([]);
      setPlans([]);
      setQuickLogs([]);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCalendarData();
  }, [loadCalendarData]);

  // Restore in-progress session from localStorage
  const sessionRestoredRef = useRef(false);
  useEffect(() => {
    if (loading || sessionRestoredRef.current) return;
    try {
      const raw = localStorage.getItem("workout-active-session");
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved?.sourcePath) return;

      const matchedPlan = plans.find((p) => p.path === saved.sourcePath);
      if (matchedPlan) { sessionRestoredRef.current = true; setActivePlan(matchedPlan); }
    } catch {}
  }, [loading, plans]);

  const sessionsByDay = useMemo(() => {
    const grouped: Record<string, Session[]> = {};
    for (const session of sessions) {
      const key = toDateKey(new Date(session.date));
      grouped[key] = grouped[key] || [];
      grouped[key].push(session);
    }
    return grouped;
  }, [sessions]);

  const plansByDay = useMemo(() => {
    const grouped: Record<string, Plan[]> = {};
    for (const plan of plans) {
      if (!plan.date) continue;
      const key = keyFromDateLike(plan.date);
      grouped[key] = grouped[key] || [];
      grouped[key].push(plan);
    }
    return grouped;
  }, [plans]);

  const quickLogsByDay = useMemo(() => {
    const grouped: Record<string, QuickLog[]> = {};
    for (const quickLog of quickLogs) {
      const key = toDateKey(new Date(quickLog.logged_at));
      grouped[key] = grouped[key] || [];
      grouped[key].push(quickLog);
    }
    return grouped;
  }, [quickLogs]);

  const monthGrid = useMemo(() => {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const firstOfMonth = new Date(year, monthIndex, 1);
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const startOffset = (firstOfMonth.getDay() + 6) % 7;

    return Array.from({ length: 42 }, (_, idx) => {
      const dayNumber = idx - startOffset + 1;
      if (dayNumber < 1 || dayNumber > daysInMonth) return null;
      return new Date(year, monthIndex, dayNumber);
    });
  }, [month]);

  const firstDayInMonth = toDateKey(month);
  const [selectedDay, setSelectedDay] = useState(firstDayInMonth);

  useEffect(() => {
    setSelectedDay(firstDayInMonth);
  }, [firstDayInMonth]);

  const selectedSessions = sessionsByDay[selectedDay] ?? [];
  const selectedPlans = plansByDay[selectedDay] ?? [];
  const selectedQuickLogs = quickLogsByDay[selectedDay] ?? [];

  return (
    <div className="p-5 pb-20 space-y-6">
      <h1 className="text-4xl font-bold tracking-tight pt-3">Calendar</h1>

      <section className="bg-card border-l-2 border-blush p-4">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() =>
              setMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
            }
            className="px-4 py-2.5 text-xs font-mono text-faded uppercase tracking-wider
              border border-rule active:bg-paper transition-colors"
          >
            Prev
          </button>
          <p className="text-sm font-semibold">{monthLabel(month)}</p>
          <button
            onClick={() =>
              setMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
            }
            className="px-4 py-2.5 text-xs font-mono text-faded uppercase tracking-wider
              border border-rule active:bg-paper transition-colors"
          >
            Next
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map((day) => (
            <div key={day} className="text-[10px] font-mono text-faded text-center py-1 uppercase tracking-wider">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {monthGrid.map((day, idx) => {
            if (!day) {
              return <div key={idx} className="aspect-square bg-paper/50" />;
            }

            const key = toDateKey(day);
            const sessionCount = sessionsByDay[key]?.length ?? 0;
            const planCount = plansByDay[key]?.length ?? 0;
            const quickLogCount = quickLogsByDay[key]?.length ?? 0;
            const isSelected = key === selectedDay;
            const isToday = key === toDateKey(new Date());

            return (
              <button
                key={key}
                onClick={() => setSelectedDay(key)}
                className={`aspect-square border p-1 flex flex-col items-center justify-center transition-colors ${
                  isSelected
                    ? "border-blush bg-blush/10 text-blush"
                    : isToday
                      ? "border-ink bg-paper text-ink"
                      : "border-paper bg-paper text-ink hover:border-rule"
                }`}
              >
                <span className={`text-xs font-mono ${isToday ? "font-bold underline underline-offset-2" : "font-medium"}`}>
                  {day.getDate()}
                </span>
                {(sessionCount > 0 || planCount > 0 || quickLogCount > 0) && (
                  <div className="mt-0.5 flex items-center gap-0.5">
                    {planCount > 0 && (
                      <span className="w-1.5 h-1.5 bg-ocean" />
                    )}
                    {sessionCount > 0 && (
                      <span className="w-1.5 h-1.5 bg-sage" />
                    )}
                    {quickLogCount > 0 && (
                      <span className="w-1.5 h-1.5 bg-blush" />
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm italic text-faded border-l-2 border-blush pl-3">
            {selectedDayLabel(selectedDay)}
          </h2>
        </div>

        {loading ? (
          <p className="text-sm italic text-faded text-center py-8">Loading...</p>
        ) : (
          <>
            <div className="space-y-3">
              <h3 className="text-[10px] font-mono text-faded uppercase tracking-[0.15em]">
                Plans
              </h3>
              {selectedPlans.length === 0 ? (
                <p className="text-sm italic text-faded text-center py-3">No plans</p>
              ) : (
                selectedPlans.map((plan) => (
                  <PlanCard key={plan.path} plan={plan} onStartWorkout={setActivePlan} />
                ))
              )}
            </div>

            <div className="space-y-3">
              <h3 className="text-[10px] font-mono text-faded uppercase tracking-[0.15em]">
                Sessions
              </h3>
              {selectedSessions.length === 0 ? (
                <p className="text-sm italic text-faded text-center py-3">No sessions logged</p>
              ) : (
                selectedSessions.map((session) => (
                  <SessionCard
                    key={session.path}
                    session={session}
                    onDelete={(path) => setDeletingPath(path)}
                  />
                ))
              )}
            </div>

            <div className="space-y-3">
              <h3 className="text-[10px] font-mono text-faded uppercase tracking-[0.15em]">
                Quick Logs
              </h3>
              {selectedQuickLogs.length === 0 ? (
                <p className="text-sm italic text-faded text-center py-3">No quick logs</p>
              ) : (
                selectedQuickLogs.map((log) => (
                  <div
                    key={log.path}
                    className="flex items-center gap-3 bg-card border-l-2 border-rule px-4 py-3"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">
                        {slugToName(parseWikilink(log.exercise))}
                      </span>
                    </div>
                    <span className="text-sm font-mono text-blush">{formatSet(log)}</span>
                    <span className="text-[10px] font-mono text-faded">{formatTime(log.logged_at)}</span>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </section>

      {activePlan && (
        <SessionLoggerSheet
          plan={activePlan}
          template={null}
          exercises={allExercises}
          onClose={() => { setActivePlan(null); sessionRestoredRef.current = false; }}
          onSaved={loadCalendarData}
        />
      )}

      <ConfirmDialog
        open={!!deletingPath}
        title="Delete Session"
        message="This will permanently delete this workout session. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deletingPath) return;
          try {
            await api.sessions.delete(pathToSlug(deletingPath));
            loadCalendarData();
          } catch (err) {
            console.error("Failed to delete session:", err);
          }
          setDeletingPath(null);
        }}
        onCancel={() => setDeletingPath(null)}
      />
    </div>
  );
}
