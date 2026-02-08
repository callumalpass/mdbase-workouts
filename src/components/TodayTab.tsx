import { useState } from "react";
import { useToday } from "../hooks/useToday";
import { useExercises } from "../hooks/useExercises";
import { parseWikilink, slugToName, formatTime, formatSet } from "../lib/utils";
import { haptics } from "../lib/haptics";
import type { Plan, PlanTemplate } from "../lib/types";
import PlanCard from "./PlanCard";
import TemplateCard from "./TemplateCard";
import QuickLogSheet from "./QuickLogSheet";
import PlanCreatorSheet from "./PlanCreatorSheet";
import SessionLoggerSheet from "./SessionLoggerSheet";

export default function TodayTab() {
  const { data, loading, refresh } = useToday();
  const { allExercises } = useExercises();
  const [showQuickLog, setShowQuickLog] = useState(false);
  const [showPlanCreator, setShowPlanCreator] = useState(false);
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<PlanTemplate | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm italic text-faded">Loading...</p>
      </div>
    );
  }

  const hasContent = data.plans.length > 0 || data.sessions.length > 0 || data.quickLogs.length > 0 || (data.templates && data.templates.length > 0);

  return (
    <div className="p-5 pb-20 space-y-8">
      <div className="pt-3">
        <h1 className="text-4xl font-bold tracking-tight">Today</h1>
        <p className="text-[11px] font-mono text-faded tracking-[0.15em] uppercase mt-1">
          {new Date().toLocaleDateString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>

      {/* Templates */}
      {data.templates && data.templates.length > 0 && (
        <section>
          <button
            onClick={() => setTemplatesOpen((o) => !o)}
            className="flex items-center gap-2 w-full text-left mb-3"
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
                  />
                </div>
              ))}
            </div>
          )}
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
            className="text-xs font-mono text-blush tracking-wider uppercase active:opacity-70 transition-opacity"
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
