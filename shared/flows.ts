import { CALL_FLOW, SCHOOL_NAME, type FlowStep } from "./scenarios.js";

// A call flow is the script structure agents are scored against: who they call for,
// what the call is for, the steps in order, and the rules they must never break.
// Trainers build these in the app, so any program can be practiced without code changes.
export interface CallFlow {
  id: string;
  name: string;
  // The company or brand the agent represents on the call.
  company: string;
  // What the call is for, in plain words.
  purpose: string;
  // How a successful call ends (for example, a warm transfer).
  endGoal: string;
  steps: FlowStep[];
  // Rules the agent must never break. Any violation fails the call.
  rules: string[];
  // The sample flow that ships with CallCraft (read-only).
  builtIn?: boolean;
  archived?: boolean;
}

// A flow in the Call flows list, with how many classes use it.
export interface FlowSummary extends CallFlow {
  classCount: number;
}

export const BUILTIN_FLOW_ID = "builtin";

export const BUILTIN_FLOW: CallFlow = {
  id: BUILTIN_FLOW_ID,
  name: "Sample: college inquiry call",
  company: SCHOOL_NAME,
  purpose: "An outbound call to someone who asked for information about a degree program.",
  endGoal: "A warm transfer to an admissions counselor",
  steps: CALL_FLOW,
  rules: [
    "Honor any do-not-call or stop-calling request immediately.",
    "Never quote tuition, fees, or financial aid amounts, and never promise aid, benefits, or admission.",
    "Give the recording disclosure before asking any qualifying questions (if the call gets that far).",
    "Don't collect personal information about the lead from a third party.",
  ],
  builtIn: true,
};

export const MAX_STEPS = 12;
export const MAX_RULES = 8;

// What a trainer submits from the call flow builder (validated by FlowInput in flowInput.ts).
export interface FlowInputValue {
  name: string;
  company: string;
  purpose: string;
  endGoal: string;
  // Existing steps keep their id so scenarios that refer to them keep working.
  steps: { id?: string; label: string; guide: string }[];
  rules: string[];
}
