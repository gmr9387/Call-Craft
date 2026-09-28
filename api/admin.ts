import Anthropic from "@anthropic-ai/sdk";
import { requireUser } from "../server/auth.js";
import { CoachError, pingAI } from "../server/coach.js";
import { recentActivity, logActivity } from "../server/audit.js";
import { db, exportEverything, pingDb, purgeOldCalls } from "../server/db.js";
import { env } from "../server/env.js";
import { anthropicReason, errorResponse, json, readJson } from "../server/http.js";
import { checkUsage, spendingLimits, usageSummary, UsageLimitError } from "../server/limits.js";
import { recentAiProblem, retentionDays, saveLimitSettings, saveRetentionDays } from "../server/settings.js";

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
// - "retention": how many days to keep practice calls (0 keeps them forever)
// - "export": everything CallCraft stores (not passwords), for a backup or a data request
export async function POST(request: Request): Promise<Response> {
  const body = await readJson(request);
  if (!body) return json({ error: "Invalid JSON body." }, 400);

  try {
    const admin = await requireUser(request, "admin");
    switch (body.action) {
      case "status": {
        // Keeping to the retention setting: delete calls that are past it.
        const days = await retentionDays();
        if (days) await purgeOldCalls(days).catch((error) => console.error("Deleting old calls failed:", error));
        const [usage, limits, aiProblem, activity, [counts]] = await Promise.all([
          usageSummary(),
          spendingLimits(),
          recentAiProblem(),
          recentActivity(),
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
          retentionDays: days,
          activity,
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
        await logActivity(
          admin,
          "Changed spending limits",
          `${limits.dailyTotal}/day, ${limits.perClientHourly}/person/hour, ${limits.draftsPerClassDaily} drafts`,
        );
        return json({ limits });
      }
      case "export": {
        await logActivity(admin, "Downloaded all data", "backup export");
        return json(await exportEverything());
      }
      case "retention": {
        const days = limitValue(body.days, "The number of days");
        if (days > 0 && days < 30) throw new LimitInputError("Keep calls for at least 30 days, or 0 to keep them forever.");
        await saveRetentionDays(days);
        await logActivity(admin, "Changed data retention", days ? `keep calls ${days} days` : "keep calls forever");
        const deleted = days ? await purgeOldCalls(days) : 0;
        return json({ retentionDays: days, deleted });
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
