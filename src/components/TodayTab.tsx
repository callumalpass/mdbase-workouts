import { useCallback, useState, useEffect, useRef } from "react";
import { useToday } from "../hooks/useToday";
import { useExercises } from "../hooks/useExercises";
import { useCachedResource } from "../hooks/useCachedResource";
import { parseWikilink, slugToName, formatTime, formatSet, pathToSlug } from "../lib/utils";
import { haptics } from "../lib/haptics";
import { api } from "../lib/api";
import { getUserTimeZone, todayLocalDateKey } from "../lib/datetime";
import type { Plan, PlanTemplate, StatsResponse, WeeklyStatsResponse } from "../lib/types";
import PlanCard from "./PlanCard";
import WeeklySetsChart from "./WeeklySetsChart";
import TemplateCard from "./TemplateCard";
import QuickLogSheet from "./QuickLogSheet";
import PlanCreatorSheet from "./PlanCreatorSheet";
import SessionLoggerSheet from "./SessionLoggerSheet";
import TemplateEditorSheet from "./TemplateEditorSheet";
import ConfirmDialog from "./ConfirmDialog";

function formatDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

export default function TodayTab() {
  const { data, loading, error, refresh } = useToday();
  const { allExercises } = useExercises();
  const [showQuickLog, setShowQuickLog] = useState(false);
  const [showPlanCreator, setShowPlanCreator] = useState(false);
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<PlanTemplate | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [showStreakRules, setShowStreakRules] = useState(false);
  const [targetSets, setTargetSets] = useState<number>(
    () => Number(localStorage.getItem("workout-weekly-target") || 80)
  );
  const [editingTarget, setEditingTarget] = useState(false);

  // Template management state
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PlanTemplate | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<PlanTemplate | null>(null);
  const [planningTemplate, setPlanningTemplate] = useState<PlanTemplate | null>(null);
  const [planningDate, setPlanningDate] = useState(() => todayLocalDateKey());
  const [planning, setPlanning] = useState(false);
  const [planningError, setPlanningError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const timeZone = getUserTimeZone();
  const loadStats = useCallback(() => api.stats.get(timeZone), [timeZone]);
  const loadWeeklyStats = useCallback(() => api.stats.weekly(timeZone), [timeZone]);
  const { data: stats, refresh: refreshStats } = useCachedResource<StatsResponse>({
    cacheKey: `stats:${timeZone}`,
    load: loadStats,
    errorMessage: "Failed to load workout stats",
  });
  const { data: weeklyStats, refresh: refreshWeeklyStats } = useCachedResource<WeeklyStatsResponse>({
    cacheKey: `weekly-stats:${timeZone}`,
    load: loadWeeklyStats,
    errorMessage: "Failed to load weekly stats",
  });

  const refreshAll = useCallback(() => {
    void refresh();
    void refreshStats();
    void refreshWeeklyStats();
  }, [refresh, refreshStats, refreshWeeklyStats]);

  // Restore in-progress session from localStorage
  const sessionRestoredRef = useRef(false);
  useEffect(() => {
    if (!data || sessionRestoredRef.current) return;
    try {
      const raw = localStorage.getItem("workout-active-session");
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved?.sourcePath) return;

      const matchedPlan = data.plans.find((p: Plan) => p.path === saved.sourcePath);
      if (matchedPlan) { sessionRestoredRef.current = true; setActivePlan(matchedPlan); return; }

      const matchedTemplate = data.templates?.find((t: PlanTemplate) => t.path === saved.sourcePath);
      if (matchedTemplate) { sessionRestoredRef.current = true; setActiveTemplate(matchedTemplate); return; }
    } catch {}
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm italic text-faded">Opening today&apos;s log</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
        <p className="text-sm text-blush">{error || "Failed to load today's data."}</p>
        <button
          onClick={refresh}
          className="px-4 py-2 text-xs font-mono uppercase tracking-wider border border-rule text-faded active:bg-card"
        >
          Retry
        </button>
      </div>
    );
  }

  const hasContent = data.plans.length > 0 || data.sessions.length > 0 || data.quickLogs.length > 0 || (data.templates && data.templates.length > 0);
  const runStatus = stats?.streak.runStatus;
  const hingeRunStatus =
    runStatus?.kind === "hinge-day" && runStatus.recoverableStreak != null ? runStatus : null;
  const isHingeDay = hingeRunStatus != null;

  const openTemplatePlanner = (template: PlanTemplate) => {
    setPlanningTemplate(template);
    setPlanningDate(todayLocalDateKey());
    setPlanningError("");
  };

  const closeTemplatePlanner = () => {
    if (planning) return;
    setPlanningTemplate(null);
    setPlanningDate(todayLocalDateKey());
    setPlanningError("");
  };

  const createPlanFromTemplate = async () => {
    if (!planningTemplate) return;
    setPlanning(true);
    setPlanningError("");
    try {
      await api.plans.create({
        date: planningDate,
        title: planningTemplate.title,
        exercises: planningTemplate.exercises.map((ex) => {
          const targetReps =
            typeof ex.target_reps === "string" ? ex.target_reps.trim() : ex.target_reps;
          return {
            exercise: parseWikilink(ex.exercise),
            ...(ex.target_sets != null && { target_sets: ex.target_sets }),
            ...(targetReps != null && targetReps !== "" && { target_reps: targetReps }),
            ...(ex.target_weight != null && { target_weight: ex.target_weight }),
            ...(ex.notes && { notes: ex.notes }),
          };
        }),
      });
      haptics.tap();
      setPlanningTemplate(null);
      setPlanningDate(todayLocalDateKey());
      refreshAll();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not create this plan.";
      setPlanningError(message);
    } finally {
      setPlanning(false);
    }
  };

  return (
    <div className="p-5 pb-20 space-y-8">
      <div className="pt-3">
        <h1 className="text-4xl font-bold tracking-tight">Today</h1>
        <p className="text-xs font-mono text-faded tracking-[0.15em] uppercase mt-1">
          {new Date().toLocaleDateString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>
      {deleteError && (
        <p className="text-sm text-blush">{deleteError}</p>
      )}

      {/* Streak widget */}
      {stats && (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => {
              haptics.tap();
              setShowStreakRules((open) => !open);
            }}
            aria-expanded={showStreakRules}
            aria-controls="streak-rules"
            className="ledger-card ledger-card-sage text-left active:bg-sage/10 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-baseline gap-2 font-mono font-bold text-sage">
                  <span className="text-2xl">{stats.streak.currentStreak}</span>
                  {isHingeDay && (
                    <span className="text-base text-amber">
                      -&gt; {hingeRunStatus.recoverableStreak}
                    </span>
                  )}
                </div>
                <div className="text-[11px] font-mono text-faded uppercase tracking-[0.15em] mt-1">
                  Current Run
                </div>
                {isHingeDay && (
                  <div className="mt-1 text-[11px] font-mono uppercase tracking-[0.15em] text-amber">
                    Hinge day
                  </div>
                )}
              </div>
              <span
                aria-hidden="true"
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border border-sage/60 text-[10px] font-mono text-sage"
              >
                ?
              </span>
            </div>
          </button>
          <div className="ledger-card ledger-card-blush">
            <div className="text-2xl font-mono font-bold text-blush">
              {stats.streak.thisWeekSessions}
            </div>
            <div className="text-[11px] font-mono text-faded uppercase tracking-[0.15em] mt-1">
              This Week
            </div>
          </div>
          {isHingeDay && (
            <div className="col-span-2 ledger-card-tight ledger-card-amber animate-fade-slide-in">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center border border-amber/60 font-mono text-sm font-bold text-amber">
                  !
                </div>
                <div className="min-w-0">
                  <h2 className="text-xs font-mono uppercase tracking-[0.15em] text-amber">
                    Hinge day
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-ink">
                    The run is still recoverable today. Record any workout or quick log to resume it at{" "}
                    <span className="font-mono font-bold text-amber">
                      {hingeRunStatus.recoverableStreak}
                    </span>.
                  </p>
                  <p className="mt-2 text-[11px] font-mono uppercase tracking-[0.15em] text-faded">
                    {hingeRunStatus.lastActiveDate
                      ? `Last active ${formatDateKey(hingeRunStatus.lastActiveDate)}`
                      : "No recent active day"}{" "}
                    / {hingeRunStatus.quietDays} quiet {hingeRunStatus.quietDays === 1 ? "day" : "days"}
                  </p>
                </div>
              </div>
            </div>
          )}
          {showStreakRules && (
            <div
              id="streak-rules"
              className="col-span-2 ledger-card-tight ledger-card-sage animate-fade-slide-in"
            >
              <h2 className="text-xs font-mono uppercase tracking-[0.15em] text-sage">
                Run rules
              </h2>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink">
                <li>A workout session or a quick log makes that date active.</li>
                <li>The run number counts active dates, not calendar days.</li>
                <li>Longest run is the highest run count you have reached under these same rules.</li>
                <li>One quiet day is allowed. A second quiet day spends one banked cheat day, if you have one; without one, the run resets.</li>
                <li>Every 7 active dates earns 1 cheat day, up to 5 banked.</li>
              </ul>
              <p className="mt-3 text-xs leading-relaxed text-faded">
                Dates are grouped in your current timezone. Rest and cheat days keep the run alive, but do not add to the count.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-sage/20 pt-3">
                <div>
                  <div className="text-[11px] font-mono uppercase tracking-[0.15em] text-faded">
                    Longest run
                  </div>
                  <div className="mt-1 text-lg font-mono font-bold text-sage">
                    {stats.streak.longestRun}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-mono uppercase tracking-[0.15em] text-faded">
                    Cheat days
                  </div>
                  <div className="mt-1 text-lg font-mono font-bold text-amber">
                    {stats.streak.bankedCheatDays}
                  </div>
                </div>
                <div className="col-span-2">
                  <div className="text-[11px] font-mono uppercase tracking-[0.15em] text-faded">
                    Spent in run
                  </div>
                  <div className="mt-1 text-xs leading-relaxed text-ink">
                    {stats.streak.cheatDayDates.length > 0
                      ? stats.streak.cheatDayDates.map(formatDateKey).join(", ")
                      : "None"}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Weekly sets chart */}
      {weeklyStats && weeklyStats.weeks.length > 1 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="ledger-section-title ledger-mark-sage">
              Sets / week
            </h2>
            {editingTarget ? (
              <input
                type="number"
                min={1}
                defaultValue={targetSets}
                autoFocus
                className="w-16 text-right text-[11px] font-mono text-faded bg-transparent border-b border-rule outline-none"
                onBlur={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (val > 0) {
                    setTargetSets(val);
                    localStorage.setItem("workout-weekly-target", String(val));
                  }
                  setEditingTarget(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") setEditingTarget(false);
                }}
              />
            ) : (
              <button
                onClick={() => setEditingTarget(true)}
                className="text-[11px] font-mono text-faded active:text-ink transition-colors"
              >
                target: {targetSets}
              </button>
            )}
          </div>
          <WeeklySetsChart weeks={weeklyStats.weeks} targetSets={targetSets} />
        </section>
      )}

      {/* PR Feed */}
      {stats && stats.prs.length > 0 && (
        <section>
          <h2 className="ledger-section-title ledger-mark-blush mb-3">
            New PRs
          </h2>
          <div className="space-y-2">
            {stats.prs.map((pr, i) => (
              <div
                key={`${pr.exercise}-${pr.type}-${i}`}
                className="ledger-card-tight ledger-card-blush flex items-center justify-between animate-fade-slide-in"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div>
                  <span className="text-sm font-semibold">{pr.exercise}</span>
                  <span className="text-xs font-mono text-faded ml-2">
                    {pr.type === "weight" ? `${pr.value}kg` : `${pr.value}kg e1RM`}
                  </span>
                </div>
                <span className={`text-[11px] font-mono uppercase tracking-[0.15em] px-1.5 py-0.5 ${
                  pr.type === "weight" ? "bg-blush/10 text-blush" : "bg-sage/10 text-sage"
                }`}>
                  {pr.type === "weight" ? "max wt" : "e1RM"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Templates */}
      {data.templates && data.templates.length > 0 && (
        <section>
          <div className="flex items-center gap-2 w-full mb-3">
            <button
              onClick={() => setTemplatesOpen((o) => !o)}
              className="flex items-center gap-2 flex-1 text-left py-2"
            >
              <span
                className="text-[10px] text-faded transition-transform duration-200"
                style={{ transform: templatesOpen ? "rotate(90deg)" : "rotate(0deg)" }}
              >
                ▶
              </span>
              <h2 className="ledger-section-title ledger-mark-ocean">
                Templates
              </h2>
            </button>
            <button
              onClick={() => { setEditingTemplate(null); setShowTemplateEditor(true); }}
              className="text-xs font-mono text-ocean tracking-wider uppercase active:opacity-70 transition-opacity py-2 px-3 -mr-3"
            >
              + New
            </button>
          </div>
          {templatesOpen && (
            <div className="space-y-3">
              {data.templates.map((template, i) => (
                <div
                  key={template.path}
                  className="animate-fade-slide-in"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <TemplateCard
                    template={template}
                    onStart={(t) => { haptics.tap(); setActiveTemplate(t); }}
                    onPlan={(t) => { haptics.tap(); openTemplatePlanner(t); }}
                    onEdit={(t) => { setEditingTemplate(t); setShowTemplateEditor(true); }}
                    onDelete={(t) => setDeletingTemplate(t)}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* No templates yet, show create button. */}
      {(!data.templates || data.templates.length === 0) && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="ledger-section-title ledger-mark-ocean">
              Templates
            </h2>
            <button
              onClick={() => { setEditingTemplate(null); setShowTemplateEditor(true); }}
              className="text-xs font-mono text-ocean tracking-wider uppercase active:opacity-70 transition-opacity py-2 px-3 -mr-3"
            >
              + New
            </button>
          </div>
        </section>
      )}

      {/* Plans */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="ledger-section-title ledger-mark-blush">
            Planned
          </h2>
          <button
            onClick={() => setShowPlanCreator(true)}
            className="text-xs font-mono text-blush tracking-wider uppercase active:opacity-70 transition-opacity py-2 px-3 -mr-3"
          >
            + New
          </button>
        </div>
        {data.plans.length > 0 ? (
          <div className="space-y-3">
            {data.plans.map((plan, i) => (
              <div
                key={plan.path}
                className="animate-fade-slide-in"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <PlanCard
                  plan={plan}
                  onStartWorkout={(p) => setActivePlan(p)}
                />
              </div>
            ))}
          </div>
        ) : (
          <button
            onClick={() => setShowPlanCreator(true)}
            className="w-full py-6 border border-dashed border-rule
              text-sm italic text-faded active:bg-card active:scale-[0.98] transition-all duration-75"
          >
            Create a workout plan
          </button>
        )}
      </section>

      {/* Today's sessions */}
      {data.sessions.length > 0 && (
        <section>
          <h2 className="ledger-section-title ledger-mark-sage mb-3">
            Completed
          </h2>
          <div className="space-y-3">
            {data.sessions.map((s, i) => (
              <div key={s.path} className="ledger-card ledger-card-sage animate-fade-slide-in active:translate-y-px transition-transform" style={{ animationDelay: `${i * 50}ms` }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold">{formatTime(s.date)}</span>
                  {s.duration_minutes && (
                    <span className="text-[11px] font-mono text-faded">{s.duration_minutes}min</span>
                  )}
                </div>
                {s.exercises?.map((ex: any, i: number) => (
                  <div key={i} className="flex items-baseline gap-2">
                    <span className="text-sm truncate flex-1">
                      {slugToName(parseWikilink(ex.exercise))}
                    </span>
                    <span className="text-xs font-mono text-faded">
                      {ex.sets?.map((set: any) => formatSet(set)).join(" / ")}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Quick logs */}
      {data.quickLogs.length > 0 && (
        <section>
          <h2 className="ledger-section-title ledger-mark-ocean mb-3">
            Quick Logs
          </h2>
          <div className="divide-y divide-rule">
            {data.quickLogs.map((log, i) => (
              <div
                key={log.path}
                className="flex items-center gap-3 py-3 animate-fade-slide-in"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium">
                    {slugToName(parseWikilink(log.exercise))}
                  </span>
                </div>
                <span className="text-sm font-mono text-blush">
                  {formatSet(log)}
                </span>
                <span className="text-[10px] font-mono text-faded">
                  {formatTime(log.logged_at)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {!hasContent && (
        <div className="text-center py-16">
          <p className="text-faded italic mb-1">Today&apos;s page is blank</p>
          <p className="text-faded/50 text-xs font-mono uppercase tracking-widest">Tap + to make the first mark</p>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => { haptics.tap(); setShowQuickLog(true); }}
        aria-label="Quick log"
        className="fixed bottom-20 right-5 w-14 h-14 bg-blush text-paper
          flex items-center justify-center text-2xl font-light
          active:scale-90 active:rotate-[-3deg] transition-transform duration-75 z-40"
      >
        +
      </button>

      {planningTemplate && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-ink/30" onClick={closeTemplatePlanner} />
          <div className="relative w-full max-w-lg bg-paper border-t-2 border-ocean p-5 pb-8 animate-[slideUp_0.2s_ease-out]">
            <div className="w-10 h-[2px] bg-rule mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-1">Plan Template</h2>
            <p className="text-sm text-faded mb-5">{planningTemplate.title}</p>

            <label className="text-[11px] font-mono text-faded uppercase tracking-[0.15em] mb-1 block">
              Date
            </label>
            <input
              type="date"
              value={planningDate}
              onChange={(e) => setPlanningDate(e.target.value)}
              className="w-full px-4 py-3 bg-paper border border-rule text-sm
                focus:outline-none focus:border-ocean transition-colors"
            />

            {planningError && (
              <p className="mt-3 text-sm text-blush">{planningError}</p>
            )}

            <div className="flex gap-2 mt-5">
              <button
                onClick={closeTemplatePlanner}
                disabled={planning}
                className="flex-1 py-3 border border-rule text-sm font-medium
                  text-faded active:bg-card active:scale-[0.98] transition-all duration-75 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={createPlanFromTemplate}
                disabled={planning || !planningDate}
                className="flex-1 py-3 bg-ocean text-paper text-sm font-medium
                  active:scale-[0.97] transition-transform duration-75 disabled:opacity-40"
              >
                {planning ? "Creating..." : "Create Plan"}
              </button>
            </div>
          </div>
        </div>
      )}

      <QuickLogSheet
        open={showQuickLog}
        onClose={() => setShowQuickLog(false)}
        onLogged={refreshAll}
      />

      <PlanCreatorSheet
        open={showPlanCreator}
        onClose={() => setShowPlanCreator(false)}
        onCreated={refreshAll}
      />

      <TemplateEditorSheet
        open={showTemplateEditor}
        template={editingTemplate}
        onClose={() => { setShowTemplateEditor(false); setEditingTemplate(null); }}
        onSaved={refreshAll}
      />

      <ConfirmDialog
        open={!!deletingTemplate}
        title="Delete Template"
        message={`Delete "${deletingTemplate?.title}"? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deletingTemplate) return;
          try {
            await api.planTemplates.delete(pathToSlug(deletingTemplate.path));
            setDeleteError("");
            refreshAll();
          } catch (err) {
            const message = err instanceof Error ? err.message : "Could not delete this template.";
            setDeleteError(message);
          }
          setDeletingTemplate(null);
        }}
        onCancel={() => setDeletingTemplate(null)}
      />

      {(activePlan || activeTemplate) && (
        <SessionLoggerSheet
          plan={activePlan}
          template={activeTemplate}
          exercises={allExercises}
          onClose={() => { setActivePlan(null); setActiveTemplate(null); sessionRestoredRef.current = false; }}
          onSaved={refreshAll}
        />
      )}
    </div>
  );
}
