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

export type CallResult = "pass" | "needs_work" | "fail";

// A trainer's review of a call: a note for the agent, and optionally a corrected score and result.
export interface CallReview {
  note: string | null;
  score: number | null;
  result: CallResult | null;
  by: string | null;
  at: string;
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
  review?: CallReview;
}

// What an agent must pass to count as ready for live calls.
export interface Requirements {
  // Scenario ids (built-in slugs or trainer-built ids). Empty means readiness isn't tracked.
  scenarioIds: string[];
  // Minimum score for a passing call to count.
  passScore: number;
}

export interface ClassDashboard {
  classInfo: ClassInfo;
  attempts: SavedAttempt[];
  // Trainer-built scenarios on the class's call flow, including hidden ones.
  scenarios: Scenario[];
  agents: ClassAgent[];
  flow: CallFlow;
  trainerId: string | null;
  archived: boolean;
  requirements: Requirements;
  // For each agent (by user id), the required scenarios they've passed.
  passed: Record<string, string[]>;
}

export interface JoinResult {
  classInfo: ClassInfo;
  // Trainer-built scenarios on the class's call flow that agents can practice.
  scenarios: Scenario[];
  // The call flow the class practices.
  flow: CallFlow;
  requirements: Requirements;
  // The required scenarios this agent has passed.
  passed: string[];
}
