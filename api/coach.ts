import Anthropic from "@anthropic-ai/sdk";
import { CoachError, prospectReply, scoreCall } from "../server/coach.js";
import { getScenario, type Turn } from "../shared/scenarios.js";

interface CoachRequest {
  action: "reply" | "score";
  scenarioId: string;
  transcript: Turn[];
}

const MAX_TURNS = 80;
const MAX_TURN_CHARS = 2000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function parseTranscript(value: unknown): Turn[] | null {
  if (!Array.isArray(value) || value.length > MAX_TURNS) return null;
  const turns: Turn[] = [];
  for (const item of value) {
    if (
      !item ||
      (item.speaker !== "agent" && item.speaker !== "prospect") ||
      typeof item.text !== "string" ||
      item.text.length > MAX_TURN_CHARS
    ) {
      return null;
    }
    turns.push({ speaker: item.speaker, text: item.text });
  }
  return turns;
}

// Single endpoint for the simulator: the AI prospect's next line, or the call scorecard.
export async function POST(request: Request): Promise<Response> {
  let body: Partial<CoachRequest>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const scenario = typeof body.scenarioId === "string" ? getScenario(body.scenarioId) : undefined;
  if (!scenario) return json({ error: "Unknown scenario." }, 400);
  const transcript = parseTranscript(body.transcript);
  if (!transcript) return json({ error: "Invalid transcript." }, 400);

  try {
    if (body.action === "reply") {
      return json({ text: await prospectReply(scenario, transcript) });
    }
    if (body.action === "score") {
      return json({ scorecard: await scoreCall(scenario, transcript) });
    }
    return json({ error: "Unknown action." }, 400);
  } catch (error) {
    if (error instanceof CoachError) {
      return json({ error: error.message }, 422);
    }
    if (error instanceof Anthropic.AuthenticationError) {
      console.error("Anthropic authentication failed:", error.message);
      return json({ error: "The AI service isn't configured. Check ANTHROPIC_API_KEY." }, 500);
    }
    if (error instanceof Anthropic.RateLimitError) {
      return json({ error: "Too many requests right now. Wait a moment and try again." }, 429);
    }
    if (error instanceof Anthropic.APIError) {
      console.error(`Anthropic API error ${error.status}:`, error.message);
      return json({ error: "The AI service had a problem. Try again." }, 502);
    }
    console.error(error);
    return json({ error: "Something went wrong." }, 500);
  }
}
