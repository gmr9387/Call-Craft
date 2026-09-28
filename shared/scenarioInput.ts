import { z } from "zod";
import { DIFFICULTIES } from "./scenarios.js";

// What a trainer submits from the scenario builder. Validated on the server.
export const ScenarioInput = z.object({
  title: z.string().trim().min(1, "Add a title.").max(80),
  difficulty: z.enum(DIFFICULTIES),
  focus: z.string().trim().min(1, "Say what the agent should practice.").max(400),
  leadName: z.string().trim().min(1, "Add the lead's name.").max(80),
  program: z.string().trim().min(1, "Add what they asked about.").max(120),
  persona: z.string().trim().min(20, "Describe the prospect in at least a sentence or two.").max(3000),
  successCriteria: z
    .array(z.string().trim().min(1).max(200))
    .min(1, "Add at least one success criterion.")
    .max(6, "Use at most 6 success criteria."),
  // Ids of call flow steps that don't apply in this scenario. Checked against the class's flow on the server.
  notApplicable: z.array(z.string().max(40)).max(12),
});

export type ScenarioInputValue = z.infer<typeof ScenarioInput>;

// Shape the AI returns when drafting a scenario. Kept free of length rules, which
// structured outputs don't enforce; the server trims the draft to fit ScenarioInput.
export const ScenarioDraft = z.object({
  title: z.string(),
  difficulty: z.enum(DIFFICULTIES),
  focus: z.string(),
  leadName: z.string(),
  program: z.string(),
  persona: z.string(),
  successCriteria: z.array(z.string()),
  notApplicable: z.array(z.string()),
});
