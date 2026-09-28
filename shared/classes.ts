import type { Turn } from "./scenarios.js";
import type { ScorecardResult } from "./scorecard.js";

// A training class (for example, one certification cohort).
export interface ClassInfo {
  name: string;
  classCode: string;
}

export interface SavedAttempt {
  id: string;
  agentName: string;
  scenarioId: string;
  startedAt: string;
  durationSec: number;
  transcript: Turn[];
  scorecard: ScorecardResult;
}

export interface ClassDashboard {
  classInfo: ClassInfo;
  attempts: SavedAttempt[];
}
