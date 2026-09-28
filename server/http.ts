import Anthropic from "@anthropic-ai/sdk";
import { CoachError } from "./coach.js";
import { DbNotConfiguredError, ScenarioLimitError } from "./db.js";

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// Maps known failures to user-facing messages; anything else is logged and hidden.
export function errorResponse(error: unknown): Response {
  if (error instanceof CoachError) {
    return json({ error: error.message }, 422);
  }
  if (error instanceof ScenarioLimitError) {
    return json({ error: error.message }, 409);
  }
  if (error instanceof DbNotConfiguredError) {
    return json({ error: error.message }, 503);
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

export function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 && text.length <= maxLength ? text : null;
}
