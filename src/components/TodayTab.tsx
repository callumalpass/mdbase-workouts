import { useState, useEffect } from "react";
import { useToday } from "../hooks/useToday";
import { useExercises } from "../hooks/useExercises";
import { parseWikilink, slugToName, formatTime, formatSet, pathToSlug } from "../lib/utils";
import { haptics } from "../lib/haptics";
import { api } from "../lib/api";
import type { Plan, PlanTemplate, StatsResponse } from "../lib/types";
import PlanCard from "./PlanCard";
import TemplateCard from "./TemplateCard";
import QuickLogSheet from "./QuickLogSheet";
import PlanCreatorSheet from "./PlanCreatorSheet";
import SessionLoggerSheet from "./SessionLoggerSheet";
import TemplateEditorSheet from "./TemplateEditorSheet";
import ConfirmDialog from "./ConfirmDialog";

export default function TodayTab() {
  const { data, loading, refresh } = useToday();
  const { allExercises } = useExercises();
  const [showQuickLog, setShowQuickLog] = useState(false);
  const [showPlanCreator, setShowPlanCreator] = useState(false);
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<PlanTemplate | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [volumeOpen, setVolumeOpen] = useState(false);

  // Template management state
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PlanTemplate | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<PlanTemplate | null>(null);

  useEffect(() => {
    api.stats.get().then(setStats).catch(() => {});
  }, [data]);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm italic text-faded">Loading...</p>
      </div>
    );
  }

  const hasContent = data.plans.length > 0 || data.sessions.length > 0 || data.quickLogs.length > 0 || (data.templates && data.templates.length > 0);

  const volumeDelta = stats?.volume?.lastWeek?.sets
    ? Math.round(((stats.volume.thisWeek.sets - stats.volume.lastWeek.sets) / stats.volume.lastWeek.sets) * 100)
    : null;

  const topMuscleGroups = stats?.volume?.muscleGroups
    ? Object.entries(stats.volume.muscleGroups)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
    : [];

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

      {/* Streak widget */}
      {stats && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card border-l-2 border-sage p-4">
            <div className="text-2xl font-mono font-bold text-sage">
              {stats.streak.weekStreak}
            </div>
            <div className="text-[11px] font-mono text-faded uppercase tracking-[0.15em] mt-1">
              Week Streak
            </div>
          </div>
          <div className="bg-card border-l-2 border-blush p-4">
            <div className="text-2xl font-mono font-bold text-blush">
              {stats.streak.thisWeekSessions}
            </div>
            <div className="text-[11px] font-mono text-faded uppercase tracking-[0.15em] mt-1">
              This Week
            </div>
          </div>
        </div>
      )}

      {/* PR Feed */}
      {stats && stats.prs.length > 0 && (
        <section>
          <h2 className="text-sm italic text-faded border-l-2 border-blush pl-3 mb-3">
            New PRs
          </h2>
          <div className="space-y-2">
            {stats.prs.map((pr, i) => (
              <div
                key={`${pr.exercise}-${pr.type}-${i}`}
                className="bg-card border-l-2 border-blush p-3 flex items-center justify-between animate-fade-slide-in"
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

      {/* Volume summary */}
      {stats && (stats.volume.thisWeek.sets > 0 || stats.volume.lastWeek.sets > 0) && (
        <section>
          <button
            onClick={() => setVolumeOpen((o) => !o)}
            className="flex items-center gap-2 w-full text-left py-2 -my-2 mb-1"
          >
            <span
              className="text-[10px] text-faded transition-transform duration-200"
              style={{ transform: volumeOpen ? "rotate(90deg)" : "rotate(0deg)" }}
            >
              ▶
            </span>
            <h2 className="text-sm italic text-faded border-l-2 border-sage pl-3">
              This Week
            </h2>
          </button>
          {volumeOpen && (
            <div className="space-y-3 animate-fade-slide-in">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-card border-l-2 border-rule p-3">
                  <div className="text-xl font-mono font-bold">{stats.volume.thisWeek.sets}</div>
                  <div className="text-[11px] font-mono text-faded uppercase tracking-[0.15em] mt-0.5">
                    Total Sets
                    {volumeDelta !== null && volumeDelta !== 0 && (
                      <span className={`ml-1.5 ${volumeDelta > 0 ? "text-sage" : "text-blush"}`}>
                        {volumeDelta > 0 ? "+" : ""}{volumeDelta}%
                      </span>
                    )}
                  </div>
                </div>
                <div className="bg-card border-l-2 border-rule p-3">
                  <div className="text-xl font-mono font-bold">
                    {stats.volume.thisWeek.volume > 0
                      ? `${(stats.volume.thisWeek.volume / 1000).toFixed(1)}t`
                      : "0"}
                  </div>
                  <div className="text-[11px] font-mono text-faded uppercase tracking-[0.15em] mt-0.5">
                    Volume
                  </div>
                </div>
              </div>
              {topMuscleGroups.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {topMuscleGroups.map(([group, sets]) => (
                    <span
                      key={group}
                      className="text-[11px] font-mono px-2 py-1 bg-paper text-faded uppercase tracking-wider"
                    >
                      {group} <span className="text-ink">{sets}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
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
              <h2 className="text-sm italic text-faded border-l-2 border-ocean pl-3">
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
                    onEdit={(t) => { setEditingTemplate(t); setShowTemplateEditor(true); }}
                    onDelete={(t) => setDeletingTemplate(t)}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* No templates yet — show create button */}
      {(!data.templates || data.templates.length === 0) && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm italic text-faded border-l-2 border-ocean pl-3">
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
          <h2 className="text-sm italic text-faded border-l-2 border-blush pl-3">
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
          <h2 className="text-sm italic text-faded border-l-2 border-sage pl-3 mb-3">
            Completed
          </h2>
          <div className="space-y-3">
            {data.sessions.map((s, i) => (
              <div key={s.path} className="bg-card border-l-2 border-sage p-4 animate-fade-slide-in active:translate-y-px transition-transform" style={{ animationDelay: `${i * 50}ms` }}>
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
          <h2 className="text-sm italic text-faded border-l-2 border-ocean pl-3 mb-3">
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
          <p className="text-faded italic mb-1">Nothing logged today</p>
          <p className="text-faded/50 text-xs font-mono uppercase tracking-widest">Tap + to start</p>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => { haptics.tap(); setShowQuickLog(true); }}
        className="fixed bottom-20 right-5 w-14 h-14 bg-blush text-white
          flex items-center justify-center text-2xl font-light
          active:scale-90 active:rotate-[-3deg] transition-transform duration-75 z-40"
      >
        +
      </button>

      <QuickLogSheet
        open={showQuickLog}
        onClose={() => setShowQuickLog(false)}
        onLogged={refresh}
      />

      <PlanCreatorSheet
        open={showPlanCreator}
        onClose={() => setShowPlanCreator(false)}
        onCreated={refresh}
      />

      <TemplateEditorSheet
        open={showTemplateEditor}
        template={editingTemplate}
        onClose={() => { setShowTemplateEditor(false); setEditingTemplate(null); }}
        onSaved={refresh}
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
            refresh();
          } catch (err) {
            console.error("Failed to delete template:", err);
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
          onClose={() => { setActivePlan(null); setActiveTemplate(null); }}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
