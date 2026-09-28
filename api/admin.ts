import Anthropic from "@anthropic-ai/sdk";
import { requireUser } from "../server/auth.js";
import { CoachError, pingAI } from "../server/coach.js";
import { db, pingDb } from "../server/db.js";
import { env } from "../server/env.js";
import { anthropicReason, errorResponse, json, readJson } from "../server/http.js";
import { checkUsage, spendingLimits, usageSummary, UsageLimitError } from "../server/limits.js";
import { recentAiProblem, saveLimitSettings } from "../server/settings.js";

const MAX_LIMIT = 1_000_000;

function limitValue(value: unknown, label: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > MAX_LIMIT) throw new LimitInputError(`${label} must be a whole number.`);
  return n;
}

class LimitInputError extends Error {}

// System endpoint, for admins:
// - "status": AI usage, spending limits, recent AI problems, and how many people are using CallCraft
// - "limits": change the spending limits (takes effect within a minute)
// - "check-ai": send one tiny AI request to see if the AI is working
export async function POST(request: Request): Promise<Response> {
  const body = await readJson(request);
  if (!body) return json({ error: "Invalid JSON body." }, 400);

  try {
    const admin = await requireUser(request, "admin");
    switch (body.action) {
      case "status": {
        const [usage, limits, aiProblem, [counts]] = await Promise.all([
          usageSummary(),
          spendingLimits(),
          recentAiProblem(),
          db()`
            select
              (select count(*)::int from users where role = 'agent' and not disabled) as agents,
              (select count(*)::int from users where role in ('trainer', 'admin') and not disabled) as staff,
              (select count(*)::int from classes where not archived) as classes,
              (select count(*)::int from attempts where created_at >= date_trunc('day', now())) as calls_today,
              (select count(distinct user_id)::int from attempts where created_at >= now() - interval '7 days') as active_week
          `,
        ]);
        return json({
          usage,
          limits,
          aiProblem,
          models: {
            replies: env("CALLCRAFT_MODEL") ?? "claude-haiku-4-5",
            scoring: env("CALLCRAFT_SCORING_MODEL") ?? env("CALLCRAFT_MODEL") ?? "claude-haiku-4-5",
          },
          counts: {
            agents: counts.agents,
            staff: counts.staff,
            classes: counts.classes,
            callsToday: counts.calls_today,
            activeThisWeek: counts.active_week,
          },
        });
      }
      case "limits": {
        const limits = {
          dailyTotal: limitValue(body.dailyTotal, "The daily limit"),
          perClientHourly: limitValue(body.perClientHourly, "The per-person limit"),
          draftsPerClassDaily: limitValue(body.draftsPerClassDaily, "The drafts limit"),
        };
        await saveLimitSettings(limits);
        console.info(`Spending limits changed by ${admin.email}:`, limits);
        return json({ limits });
      }
      case "check-ai": {
        const database = await pingDb().then(
          () => ({ ok: true, detail: "Connected." }),
          (error: unknown) => ({ ok: false, detail: error instanceof Error ? error.message : "Unknown error." }),
        );
        try {
          await checkUsage("health", request, null, admin.id);
          const { model } = await pingAI();
          return json({ ai: { ok: true, detail: `Working (${model}).` }, database });
        } catch (error) {
          const detail =
            error instanceof Anthropic.APIError
              ? `Anthropic returned ${error.status ?? "an error"}: ${anthropicReason(error)}`
              : error instanceof CoachError || error instanceof UsageLimitError
                ? error.message
                : "Unknown error.";
          return json({ ai: { ok: false, detail }, database });
        }
      }
      default:
        return json({ error: "Unknown action." }, 400);
    }
  } catch (error) {
    if (error instanceof LimitInputError) return json({ error: error.message }, 400);
    return errorResponse(error);
  }
}
