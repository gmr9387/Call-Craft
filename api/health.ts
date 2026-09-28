import Anthropic from "@anthropic-ai/sdk";
import { CoachError, pingAI } from "../server/coach.js";
import { isDbConfigured, pingDb } from "../server/db.js";
import { env } from "../server/env.js";
import { anthropicReason, json } from "../server/http.js";
import { UsageLimitError, checkUsage } from "../server/limits.js";

interface Check {
  ok: boolean;
  detail: string;
}

async function checkAI(request: Request): Promise<Check> {
  if (!env("ANTHROPIC_API_KEY") && !env("ANTHROPIC_AUTH_TOKEN")) {
    return { ok: false, detail: "ANTHROPIC_API_KEY isn't set for this deployment. Add it in Vercel, then redeploy." };
  }
  try {
    await checkUsage("health", request);
    const { model, scoringModel, fallback } = await pingAI();
    return {
      ok: true,
      detail: `Working (replies: ${model}, scoring: ${scoringModel}${fallback ? "" : ", refusal fallback not available"}).`,
    };
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      return { ok: false, detail: `Anthropic returned ${error.status ?? "an error"}: ${anthropicReason(error)}` };
    }
    if (error instanceof CoachError || error instanceof UsageLimitError) return { ok: false, detail: error.message };
    return { ok: false, detail: error instanceof Error ? error.message : "Unknown error." };
  }
}

async function checkDb(): Promise<Check> {
  if (!isDbConfigured()) {
    return { ok: false, detail: "DATABASE_URL isn't set for this deployment. Classes won't save until it is." };
  }
  try {
    await pingDb();
    return { ok: true, detail: "Connected, tables found." };
  } catch (error) {
    // This page is public, so it gives a plain reason and never the raw error (which can name servers).
    console.error("Health check database error:", error);
    const code = (error as { code?: string }).code;
    if (code === "42P01") return { ok: false, detail: "Connected, but tables are missing: run db/schema.sql." };
    if (code === "28P01") return { ok: false, detail: "The database rejected the password in DATABASE_URL." };
    return { ok: false, detail: `Couldn't reach the database${code ? ` (code ${code})` : ""}. Check DATABASE_URL.` };
  }
}

// Open /api/health in a browser to see whether the AI and the database are set up.
// It makes one tiny AI request; it never shows keys or connection strings.
export async function GET(request: Request): Promise<Response> {
  const [ai, database] = await Promise.all([checkAI(request), checkDb()]);
  return json({ ok: ai.ok && database.ok, ai, database }, ai.ok && database.ok ? 200 : 503);
}
