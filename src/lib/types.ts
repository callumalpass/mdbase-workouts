export type TrackingType = "weight_reps" | "reps_only" | "timed" | "distance";

export interface Exercise {
  path: string;
  name: string;
  muscle_groups: string[];
  equipment: string;
  tracking: TrackingType;
}

export interface SetData {
  reps?: number;
  weight?: number;
  duration_seconds?: number;
  distance?: number;
  notes?: string;
}

export interface SessionExercise {
  exercise: string; // wikilink like [[exercises/bench-press]]
  sets: SetData[];
}

export interface Session {
  path: string;
  date: string;
  exercises: SessionExercise[];
  duration_minutes?: number;
  plan?: string;
  rating?: number;
  notes?: string;
}

export interface PlanExercise {
  exercise: string;
  target_sets?: number;
  target_reps?: number;
  target_weight?: number;
  notes?: string;
}

export interface Plan {
  path: string;
  date: string;
  title: string;
  exercises: PlanExercise[];
  status: "scheduled" | "completed" | "skipped";
  session?: string;
  notes?: string;
}

export interface TemplateExercise {
  exercise: string;
  target_sets?: number;
  target_reps?: string; // "8", "AMRAP", "10-12"
  target_weight?: number;
  notes?: string;
}

export interface PlanTemplate {
  path: string;
  title: string;
  exercises: TemplateExercise[];
  notes?: string;
}

export interface QuickLog {
  path: string;
  exercise: string;
  reps?: number;
  weight?: number;
  duration_seconds?: number;
  distance?: number;
  logged_at: string;
  notes?: string;
}

export interface TodayData {
  date: string;
  plans: Plan[];
  sessions: Session[];
  quickLogs: QuickLog[];
  templates: PlanTemplate[];
}

export interface ExerciseHistoryEntry {
  source: "session" | "quick-log";
  date: string;
  sets: SetData[];
  sessionPath?: string;
}

export interface ExerciseStats {
  totalEntries: number;
  firstLogged: string | null;
  lastLogged: string | null;
  // weight_reps
  prWeight?: number;
  prSet?: string;
  totalVolume?: number;
  avgSetsPerSession?: number;
  // reps_only
  maxReps?: number;
  totalReps?: number;
  // timed
  longestDuration?: number;
  totalDuration?: number;
  // distance
  longestDistance?: number;
  totalDistance?: number;
}

export interface ExerciseHistory {
  exercise: Exercise;
  stats: ExerciseStats;
  entries: ExerciseHistoryEntry[];
}

export interface PR {
  exercise: string;
  type: "weight" | "e1rm";
  value: number;
  reps?: number;
  date: string;
}

export interface StatsResponse {
  streak: {
    weekStreak: number;
    thisWeekSessions: number;
  };
  prs: PR[];
  volume: {
    thisWeek: { sets: number; volume: number };
    lastWeek: { sets: number; volume: number };
    muscleGroups: Record<string, number>;
  };
}

export interface ChatMessage {
  role: "user" | "assistant" | "tool";
  content: string;
}
