import type { Scenario, Turn } from "./scenarios.js";
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
  // Title at the time of the call; set for every call saved after scenarios became editable.
  scenarioTitle?: string;
  startedAt: string;
  durationSec: number;
  transcript: Turn[];
  scorecard: ScorecardResult;
}

export interface ClassDashboard {
  classInfo: ClassInfo;
  attempts: SavedAttempt[];
  // Trainer-built scenarios for this class, including archived ones.
  scenarios: Scenario[];
}

export interface JoinResult {
  classInfo: ClassInfo;
  // Active trainer-built scenarios agents in this class can practice.
  scenarios: Scenario[];
}
