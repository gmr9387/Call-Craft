import Anthropic from "@anthropic-ai/sdk";
import { CoachError } from "./coach.js";
import { DbNotConfiguredError, ScenarioLimitError } from "./db.js";
import { UsageLimitError } from "./limits.js";
import { AccountInputError, AuthError } from "./auth.js";
import { TamperedCallError } from "./signing.js";

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });
}

// Only JSON bodies are accepted. Browsers can't send those from another site without asking
// first, which (with SameSite cookies) keeps other sites from acting as a signed-in person.
export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  if (!request.headers.get("content-type")?.includes("application/json")) return null;
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// The reason Anthropic gave, e.g. "Your credit balance is too low..." (never includes the key).
export function anthropicReason(error: InstanceType<typeof Anthropic.APIError>): string {
  const body = error.error as { error?: { message?: unknown } } | undefined;
  const message = body?.error?.message;
  return typeof message === "string" && message ? message : error.message;
}

// Maps known failures to user-facing messages; anything else is logged and hidden.
export function errorResponse(error: unknown): Response {
  if (error instanceof AuthError) {
    return json({ error: error.message }, error.status);
  }
  if (error instanceof TamperedCallError) {
    return json({ error: error.message }, 400);
  }
  if (error instanceof AccountInputError) {
    return json({ error: error.message }, 400);
  }
  if (error instanceof CoachError) {
    return json({ error: error.message }, 422);
  }
  if (error instanceof UsageLimitError) {
    return json({ error: error.message }, 429);
  }
  if (error instanceof ScenarioLimitError) {
    return json({ error: error.message }, 409);
  }
  if (error instanceof DbNotConfiguredError) {
    return json({ error: error.message }, 503);
  }
  if (error instanceof Anthropic.AuthenticationError) {
    console.error("Anthropic authentication failed:", error.message);
    return json({ error: "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in Vercel and redeploy." }, 500);
  }
  if (error instanceof Anthropic.RateLimitError) {
    return json({ error: "Too many requests right now. Wait a moment and try again." }, 429);
  }
  if (error instanceof Anthropic.APIError) {
    console.error(`Anthropic API error ${error.status}:`, error.message);
    return json({ error: `The AI service returned an error (${error.status ?? "no status"}): ${anthropicReason(error)}` }, 502);
  }
  console.error(error);
  return json({ error: "Something went wrong." }, 500);
}

export function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 && text.length <= maxLength ? text : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A database id sent by the browser, or null if it isn't one.
export function cleanId(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}
