import { z } from "zod";

// Structured scorecard the scorer returns for every practice call.
export const Scorecard = z.object({
  overall_score: z.number().describe("0-100"),
  result: z.enum(["pass", "needs_work", "fail"]),
  outcome: z.string().describe("One sentence: how the call ended"),
  steps: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      status: z.enum(["done", "missed", "out_of_order", "not_applicable"]),
      evidence: z.string().describe("Short quote or observation from the call"),
    }),
  ),
  scenario_criteria: z.array(
    z.object({
      criterion: z.string(),
      met: z.boolean(),
      evidence: z.string(),
    }),
  ),
  compliance: z.array(
    z.object({
      rule: z.string(),
      status: z.enum(["ok", "violation"]),
      evidence: z.string(),
    }),
  ),
  soft_skills: z.array(
    z.object({
      skill: z.enum(["Tone", "Empathy", "Pacing", "Objection handling", "Confidence"]),
      score: z.number().describe("1-5"),
      note: z.string(),
    }),
  ),
  strengths: z.array(z.string()),
  coaching: z.array(z.string()).describe("2-3 specific, actionable tips"),
});

export type ScorecardResult = z.infer<typeof Scorecard>;
