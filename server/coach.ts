import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { env } from "./env.js";
import {
  CALL_FLOW,
  END_MARKERS,
  SCHOOL_NAME,
  STEP_IDS,
  type Scenario,
  type Turn,
} from "../shared/scenarios.js";
import { Scorecard, type ScorecardResult } from "../shared/scorecard.js";
import { ScenarioDraft, type ScenarioInputValue } from "../shared/scenarioInput.js";

// Claude Haiku 4.5 is the lowest-cost current model. Override per deployment with
// CALLCRAFT_MODEL (the prospect's replies) and CALLCRAFT_SCORING_MODEL (scoring and
// scenario drafts), for example "claude-opus-5" for higher quality at higher cost.
const REPLY_MODEL = env("CALLCRAFT_MODEL") ?? "claude-haiku-4-5";
const SCORING_MODEL = env("CALLCRAFT_SCORING_MODEL") ?? REPLY_MODEL;

type Effort = "low" | "medium" | "high";

// Haiku 4.5 (and older models) reject the effort setting, so only send it where it's supported.
function effortFor(model: string, effort: Effort): { effort?: Effort } {
  return /haiku|sonnet-4-5|opus-4-[015]/.test(model) ? {} : { effort };
}

// Request settings for a plain text reply: nothing at all when the model takes no effort setting.
function replyConfig(model: string, effort: Effort): { output_config?: { effort?: Effort } } {
  const config = effortFor(model, effort);
  return config.effort ? { output_config: config } : {};
}

// The server-side refusal fallback is only used with the models it's documented for.
function fallbackEligible(model: string): boolean {
  return /^claude-(opus-5|fable-5-1)/.test(model);
}

// Server-side refusal fallback: a declined request is re-run on Anthropic's
// recommended fallback model inside the same call. It's a beta feature, so if an
// account doesn't have it, requests are retried (and later sent) without it.
const FALLBACK: { betas: Anthropic.Beta.AnthropicBeta[]; fallbacks: "default" } = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
};
type FallbackOptions = Partial<typeof FALLBACK>;
let fallbackSupported = true;

async function withFallback<T>(model: string, run: (options: FallbackOptions) => Promise<T>): Promise<T> {
  if (!fallbackSupported || !fallbackEligible(model)) return run({});
  try {
    return await run(FALLBACK);
  } catch (error) {
    if (error instanceof Anthropic.BadRequestError && /fallback|beta/i.test(error.message)) {
      console.warn("Refusal fallback isn't available on this account; continuing without it.");
      fallbackSupported = false;
      return run({});
    }
    throw error;
  }
}

let client: Anthropic | undefined;
function getClient(): Anthropic {
  const apiKey = env("ANTHROPIC_API_KEY");
  if (!apiKey && !env("ANTHROPIC_AUTH_TOKEN")) {
    throw new CoachError("The AI service isn't configured yet: set ANTHROPIC_API_KEY on the server.");
  }
  // A stuck request gives up after a minute and retries once, so calls never hang.
  client ??= new Anthropic({ apiKey, authToken: env("ANTHROPIC_AUTH_TOKEN"), timeout: 60_000, maxRetries: 1 });
  return client;
}

export class CoachError extends Error {}

function prospectSystem(scenario: Scenario): string {
  return `You are role-playing a person receiving an outbound phone call, for a call center agent training simulator.
The agent is calling from ${SCHOOL_NAME} about an information request for the ${scenario.program} program. The lead on file is ${scenario.leadName}.

Your character:
${scenario.persona}

How to play the call:
- You already picked up and said "Hello?". The agent speaks next.
- Talk like a real person on the phone: short, natural, spoken sentences (usually 1-3). No stage directions, no emojis, no lists.
- Stay in character no matter what. Never mention being an AI, a simulation, or training.
- Don't coach the agent or make the call easy. React to exactly what they say, including mistakes.
- Only share personal details when the agent asks for them.
- If you end the call by hanging up, end your final line with ${END_MARKERS.hangUp}
- If the agent says they're bringing an admissions counselor on the line and you agree, reply briefly and end your line with ${END_MARKERS.transferred}`;
}

function toMessages(transcript: Turn[]): Anthropic.Beta.BetaMessageParam[] {
  return transcript.map((turn) => ({
    role: turn.speaker === "agent" ? "user" : "assistant",
    content: turn.text,
  }));
}

function textOf(content: Anthropic.Beta.BetaContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

export async function prospectReply(scenario: Scenario, transcript: Turn[]): Promise<string> {
  if (transcript.length === 0 || transcript[transcript.length - 1].speaker !== "agent") {
    throw new CoachError("The agent must speak before the prospect replies.");
  }

  const response = await withFallback(REPLY_MODEL, (fallback) =>
    getClient().beta.messages.create({
      ...fallback,
      model: REPLY_MODEL,
      max_tokens: 4000,
      // Fast, conversational replies matter more than deep reasoning here.
      ...replyConfig(REPLY_MODEL, "low"),
      system: prospectSystem(scenario),
      messages: toMessages(transcript),
    }),
  );

  if (response.stop_reason === "refusal") {
    throw new CoachError("The prospect couldn't respond to that. Try rephrasing.");
  }
  const text = textOf(response.content);
  if (!text) throw new CoachError("The prospect didn't respond. Try again.");
  return text;
}


function scoringPrompt(scenario: Scenario, transcript: Turn[]): string {
  const na = new Set(scenario.notApplicable ?? []);
  const flow = CALL_FLOW.map(
    (s, i) => `${i + 1}. ${s.id} (${s.label}): ${s.guide}${na.has(s.id) ? " [NOT APPLICABLE in this scenario]" : ""}`,
  ).join("\n");
  const lines = transcript
    .map((t) => `${t.speaker === "agent" ? "AGENT" : "PROSPECT"}: ${t.text}`)
    .join("\n");

  return `You are a contact center quality analyst scoring a practice call from a training simulator.

Scenario: "${scenario.title}" (${scenario.difficulty})
What the agent should practice: ${scenario.focus}
School: ${SCHOOL_NAME}. Lead on file: ${scenario.leadName}. Program: ${scenario.program}.
Hidden prospect persona (the agent did not see this):
${scenario.persona}

Standard call flow, in the expected order:
${flow}

Scenario-specific success criteria:
${scenario.successCriteria.map((c) => `- ${c}`).join("\n")}

Compliance rules (any violation means result "fail"):
- Honor any do-not-call or stop-calling request immediately.
- Never quote tuition, fees, or financial aid amounts, and never promise aid, benefits, or admission.
- Give the recording disclosure before asking any qualifying questions (if the call gets that far).
- Don't collect personal information about the lead from a third party.

Transcript:
${lines}

Score the call:
- steps: one entry per standard flow step, in order, using its id and label. Use "not_applicable" for steps marked not applicable and for steps the call legitimately never reached because of the scenario (for example, the prospect asked not to be called). Use "out_of_order" when a step was done but in the wrong place.
- scenario_criteria: one entry per scenario-specific criterion.
- compliance: one entry per compliance rule above.
- soft_skills: exactly one entry each for Tone, Empathy, Pacing, Objection handling, Confidence, scored 1-5.
- overall_score 0-100, weighing compliance and scenario criteria most. result: "pass" (80+ with no violations), "needs_work", or "fail" (any compliance violation or under 50).
- Evidence should quote or closely paraphrase the transcript. Be fair and specific; coaching tips should tell the agent exactly what to say or do differently.`;
}

export async function scoreCall(scenario: Scenario, transcript: Turn[]): Promise<ScorecardResult> {
  if (!transcript.some((t) => t.speaker === "agent")) {
    throw new CoachError("There's nothing to score yet. Say something on the call first.");
  }

  const response = await withFallback(SCORING_MODEL, (fallback) =>
    getClient().beta.messages.parse({
      ...fallback,
      model: SCORING_MODEL,
      max_tokens: 16000,
      output_config: { ...effortFor(SCORING_MODEL, "high"), format: betaZodOutputFormat(Scorecard) },
      messages: [{ role: "user", content: scoringPrompt(scenario, transcript) }],
    }),
  );

  if (response.stop_reason === "refusal") {
    throw new CoachError("This call couldn't be scored. Try another practice call.");
  }
  if (!response.parsed_output) {
    throw new CoachError("The scorecard came back incomplete. Try scoring again.");
  }
  return response.parsed_output;
}

function draftPrompt(description: string): string {
  const flow = CALL_FLOW.map((s) => `- ${s.id} (${s.label}): ${s.guide}`).join("\n");
  const example = SCENARIOS_EXAMPLE;
  return `You help contact center trainers build practice scenarios for a call simulator.
Agents make an outbound call for ${SCHOOL_NAME} (a fictional school) to someone who requested program information. An AI plays the prospect using the persona you write, and a scorer grades the agent on the standard call flow plus your success criteria.

Standard call flow:
${flow}

Here is an example of a finished scenario, for format and level of detail:
${example}

The trainer wants a scenario like this:
"""
${description}
"""

Write the scenario:
- title: short and specific, under 60 characters.
- difficulty: Easy, Medium, or Hard.
- focus: one or two sentences telling the agent what to practice. Don't reveal hidden details of the persona.
- leadName and program: a realistic fictional person and a plausible degree program.
- persona: written to the AI prospect in second person ("You are..."). Include background, highest education, military affiliation, mood, what they want, and exactly how they react to good versus poor handling. 80-200 words.
- successCriteria: 2-4 specific, observable things the agent must do in this scenario.
- notApplicable: ids of standard flow steps the call can't reasonably reach in this scenario (for example, qualifying questions when the right person isn't on the line). Usually empty.
Keep everything fictional and generic. Never include real companies, real schools, or real people.`;
}

const SCENARIOS_EXAMPLE = `title: "Just tell me the price"
difficulty: Medium
focus: The prospect keeps pushing for tuition and financial aid numbers. Redirect without quoting anything.
leadName: Alicia Moreno
program: RN to BSN (Nursing)
persona: You are Alicia Moreno, 38, a working registered nurse with an associate degree in nursing. No military affiliation. You're interested but money is your main concern. Early and repeatedly ask about tuition and financial aid. If the agent gives you actual numbers or promises about aid, accept them happily. If the agent explains the admissions counselor can go over costs and aid in detail, accept it after the second redirect and continue.
successCriteria: ["Never quotes tuition, fees, or financial aid amounts", "Acknowledges the cost concern with empathy and redirects to the admissions counselor"]
notApplicable: []`;

function clip(text: string, max: number): string {
  const t = text.trim();
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + "…";
}

// Drafts a scenario from a trainer's one-line description. The trainer reviews and edits it before saving.
export async function draftScenario(description: string): Promise<ScenarioInputValue> {
  const response = await withFallback(SCORING_MODEL, (fallback) =>
    getClient().beta.messages.parse({
      ...fallback,
      model: SCORING_MODEL,
      max_tokens: 16000,
      output_config: { ...effortFor(SCORING_MODEL, "medium"), format: betaZodOutputFormat(ScenarioDraft) },
      messages: [{ role: "user", content: draftPrompt(description) }],
    }),
  );

  if (response.stop_reason === "refusal") {
    throw new CoachError("That description couldn't be turned into a scenario. Try describing it differently.");
  }
  const d = response.parsed_output;
  if (!d) throw new CoachError("The draft came back incomplete. Try again.");

  const criteria = d.successCriteria.map((c) => clip(c, 200)).filter(Boolean).slice(0, 6);
  return {
    title: clip(d.title, 80),
    difficulty: d.difficulty,
    focus: clip(d.focus, 400),
    leadName: clip(d.leadName, 80),
    program: clip(d.program, 120),
    persona: clip(d.persona, 3000),
    successCriteria: criteria.length ? criteria : ["Completes the standard call flow professionally"],
    notApplicable: [...new Set(d.notApplicable)].filter((id) => (STEP_IDS as readonly string[]).includes(id)),
  };
}

// Smallest possible request, for the health check page.
export async function pingAI(): Promise<{ model: string; scoringModel: string; fallback: boolean }> {
  const response = await withFallback(REPLY_MODEL, (fallback) =>
    getClient().beta.messages.create({
      ...fallback,
      model: REPLY_MODEL,
      max_tokens: 256,
      ...replyConfig(REPLY_MODEL, "low"),
      messages: [{ role: "user", content: "Reply with the word OK." }],
    }),
  );
  return {
    model: response.model,
    scoringModel: SCORING_MODEL,
    // Only worth reporting when the model would use the fallback.
    fallback: !fallbackEligible(REPLY_MODEL) || fallbackSupported,
  };
}
