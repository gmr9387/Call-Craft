import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import {
  CALL_FLOW,
  END_MARKERS,
  SCHOOL_NAME,
  type Scenario,
  type Turn,
} from "../shared/scenarios.js";
import { Scorecard, type ScorecardResult } from "../shared/scorecard.js";

const MODEL = process.env.CALLCRAFT_MODEL ?? "claude-opus-5";

// Server-side refusal fallback: a declined request is re-run on Anthropic's
// recommended fallback model inside the same call.
const FALLBACK: { betas: Anthropic.Beta.AnthropicBeta[]; fallbacks: "default" } = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
};

let client: Anthropic | undefined;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    throw new CoachError("The AI service isn't configured yet: set ANTHROPIC_API_KEY on the server.");
  }
  client ??= new Anthropic();
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

  const response = await getClient().beta.messages.create({
    ...FALLBACK,
    model: MODEL,
    max_tokens: 4000,
    // Fast, conversational replies matter more than deep reasoning here.
    output_config: { effort: "low" },
    system: prospectSystem(scenario),
    messages: toMessages(transcript),
  });

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

  const response = await getClient().beta.messages.parse({
    ...FALLBACK,
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "high", format: betaZodOutputFormat(Scorecard) },
    messages: [{ role: "user", content: scoringPrompt(scenario, transcript) }],
  });

  if (response.stop_reason === "refusal") {
    throw new CoachError("This call couldn't be scored. Try another practice call.");
  }
  if (!response.parsed_output) {
    throw new CoachError("The scorecard came back incomplete. Try scoring again.");
  }
  return response.parsed_output;
}
