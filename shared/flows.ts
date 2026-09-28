import { z } from "zod";
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

const STEP_ID = /^[a-z0-9_]{1,40}$/;

// What a trainer submits from the call flow builder. Validated on the server.
export const FlowInput = z.object({
  name: z.string().trim().min(1, "Give the call flow a name.").max(100),
  company: z.string().trim().min(1, "Add the company or brand the agent calls for.").max(100),
  purpose: z.string().trim().min(1, "Say what the call is for.").max(300),
  endGoal: z.string().trim().min(1, "Say how a good call ends.").max(200),
  steps: z
    .array(
      z.object({
        // Existing steps keep their id so scenarios that refer to them keep working.
        id: z.string().regex(STEP_ID).optional(),
        label: z.string().trim().min(1, "Every step needs a name.").max(60),
        guide: z.string().trim().min(1, "Say what the agent does in every step.").max(300),
      }),
    )
    .min(2, "Add at least 2 steps.")
    .max(MAX_STEPS, `Use at most ${MAX_STEPS} steps.`),
  rules: z.array(z.string().trim().min(1).max(300)).max(MAX_RULES, `Use at most ${MAX_RULES} rules.`),
});

export type FlowInputValue = z.infer<typeof FlowInput>;

// Shape the AI returns when drafting a flow; the server trims it to fit FlowInput.
export const FlowDraft = z.object({
  name: z.string(),
  company: z.string(),
  purpose: z.string(),
  endGoal: z.string(),
  steps: z.array(z.object({ label: z.string(), guide: z.string() })),
  rules: z.array(z.string()),
});
