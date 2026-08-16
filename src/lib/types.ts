export type TrackingType = "weight_reps" | "reps_only" | "timed" | "distance";

export interface AuthorityRecord {
  path: string;
  revision?: string;
}

export interface Exercise extends AuthorityRecord {
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

export interface Session extends AuthorityRecord {
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
  target_reps?: string | number;
  target_weight?: number;
  notes?: string;
}

export interface Plan extends AuthorityRecord {
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

export interface PlanTemplate extends AuthorityRecord {
  title: string;
  exercises: TemplateExercise[];
  notes?: string;
}

export interface QuickLog extends AuthorityRecord {
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
    currentStreak: number;
    longestRun: number;
    thisWeekSessions: number;
    bankedCheatDays: number;
    cheatDayDates: string[];
    currentRunDates: string[];
    runDates: string[];
    runStatus: {
      kind: "active" | "quiet-day" | "hinge-day" | "reset";
      todayActive: boolean;
      quietDays: number;
      lastActiveDate: string | null;
      recoverableStreak: number | null;
    };
  };
  prs: PR[];
  volume: {
    thisWeek: { sets: number; volume: number };
    lastWeek: { sets: number; volume: number };
    muscleGroups: Record<string, number>;
  };
}

export interface WeeklySetEntry {
  weekStart: string;
  sets: number;
  isCurrentWeek: boolean;
}

export interface WeeklyStatsResponse {
  weeks: WeeklySetEntry[];
}

export interface LastSessionData {
  date: string;
  sets: SetData[];
}

export interface SessionListResponse {
  sessions: Session[];
  total: number;
  hasMore: boolean;
}

export interface SettingsResponse {
  dataDir: string;
  configDataDir: string;
  collectionName?: string;
}

export interface CreateExerciseInput {
  name: string;
  muscle_groups: string[];
  equipment: string;
  tracking: TrackingType;
}

export interface CreateQuickLogInput {
  exercise: string;
  reps?: number;
  weight?: number;
  duration_seconds?: number;
  distance?: number;
  notes?: string;
}

export interface CreateSessionInput {
  date?: string;
  exercises: Array<{
    exercise: string;
    sets: SetData[];
  }>;
  duration_minutes?: number;
  plan?: string;
  rating?: number;
  notes?: string;
}

export interface CreatePlanInput {
  date?: string;
  title: string;
  exercises: Array<{
    exercise: string;
    target_sets?: number;
    target_reps?: string | number;
    target_weight?: number;
    notes?: string;
  }>;
  notes?: string;
}

export interface CreatePlanTemplateInput {
  title: string;
  exercises: Array<{
    exercise: string;
    target_sets?: number;
    target_reps?: string;
    target_weight?: number;
    notes?: string;
  }>;
  notes?: string;
}

export interface LastSetsResponse {
  [slug: string]: {
    date: string;
    sets: SetData[];
  };
}
