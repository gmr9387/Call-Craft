import type { Scenario, Turn } from "./scenarios.js";
import type { ScorecardResult } from "./scorecard.js";
import type { CallFlow } from "./flows.js";

// A training class (for example, one certification cohort).
export interface ClassInfo {
  id: string;
  name: string;
  classCode: string;
}

// A class in a trainer's (or admin's) class list.
export interface ClassSummary extends ClassInfo {
  trainerId: string | null;
  trainerName: string | null;
  flowName: string;
  archived: boolean;
  agentCount: number;
  callCount: number;
  lastCallAt: string | null;
}

// An agent on a class roster.
export interface ClassAgent {
  id: string;
  name: string;
  email: string;
  disabled: boolean;
  lastSeenAt: string | null;
}

export interface SavedAttempt {
  id: string;
  // The account that made the call.
  userId?: string;
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
  agents: ClassAgent[];
  flow: CallFlow;
  trainerId: string | null;
  archived: boolean;
}

export interface JoinResult {
  classInfo: ClassInfo;
  // Active trainer-built scenarios agents in this class can practice.
  scenarios: Scenario[];
  // The call flow the class practices.
  flow: CallFlow;
}
