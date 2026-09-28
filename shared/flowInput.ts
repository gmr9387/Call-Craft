import { z } from "zod";
import { MAX_RULES, MAX_STEPS } from "./flows.js";

const STEP_ID = /^[a-z0-9_]{1,40}$/;

// Server-side validation for the call flow builder (kept out of the browser bundle).
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


// Shape the AI returns when drafting a flow; the server trims it to fit FlowInput.
export const FlowDraft = z.object({
  name: z.string(),
  company: z.string(),
  purpose: z.string(),
  endGoal: z.string(),
  steps: z.array(z.object({ label: z.string(), guide: z.string() })),
  rules: z.array(z.string()),
});
