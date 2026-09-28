import { createHash } from "node:crypto";
import { dbOrNull } from "./db.js";
import { env } from "./env.js";

// Spending guardrails. Every AI request is checked against these limits before it runs,
// so a runaway script or a leaked link can't drain the Anthropic balance.
// Each limit can be changed per deployment with the environment variable named next to it.

export type UsageKind = "reply" | "score" | "draft" | "health";

function limit(name: string, fallback: number): number {
  const value = Number(env(name));
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export const limits = {
  // All AI requests across the whole site in one UTC day. The main budget backstop.
  dailyTotal: () => limit("CALLCRAFT_DAILY_AI_LIMIT", 1500),
  // AI requests from one computer (IP address) in the last hour.
  perClientHourly: () => limit("CALLCRAFT_HOURLY_CLIENT_LIMIT", 120),
  // Scenario drafts ("Write it for me") per class per UTC day.
  draftsPerClassDaily: () => limit("CALLCRAFT_DAILY_DRAFT_LIMIT", 25),
  // Health-check AI pings from one computer per hour.
  healthPerClientHourly: () => limit("CALLCRAFT_HOURLY_HEALTH_LIMIT", 10),
};

export class UsageLimitError extends Error {}

const MESSAGES = {
  daily: "CallCraft has reached today's practice limit. Please try again tomorrow.",
  client: "You're going a little fast. Wait a few minutes and try again.",
  drafts: "This class has used today's scenario drafts. You can still write scenarios by hand.",
  health: "Too many health checks from this computer. Try again later.",
} as const;

// A salted hash of the caller's IP address, so usage can be counted without storing the address.
export function clientId(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
  const salt = env("CALLCRAFT_USAGE_SALT") ?? "callcraft";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

// In-memory fallback when there's no database. Per server instance, so looser, but still a guard.
const memory: { kind: UsageKind; client: string; classCode: string | null; at: number }[] = [];

function startOfUtcDay(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

interface Counts {
  total: number;
  client: number;
  classDrafts: number;
  clientHealth: number;
}

async function countUsage(client: string, classCode: string | null, memoryOnly = false): Promise<Counts> {
  const now = Date.now();
  const dayStart = startOfUtcDay(now);
  const hourAgo = now - 60 * 60 * 1000;
  const sql = memoryOnly ? null : dbOrNull();

  if (!sql) {
    const today = memory.filter((m) => m.at >= dayStart);
    return {
      total: today.length,
      client: memory.filter((m) => m.client === client && m.at >= hourAgo && m.kind !== "health").length,
      classDrafts: classCode ? today.filter((m) => m.kind === "draft" && m.classCode === classCode).length : 0,
      clientHealth: memory.filter((m) => m.client === client && m.at >= hourAgo && m.kind === "health").length,
    };
  }

  const [row] = await sql`
    select
      count(*) filter (where created_at >= ${new Date(dayStart)})::int as total,
      count(*) filter (
        where client_hash = ${client} and created_at >= ${new Date(hourAgo)} and kind <> 'health'
      )::int as client,
      count(*) filter (
        where kind = 'draft' and class_code = ${classCode} and created_at >= ${new Date(dayStart)}
      )::int as class_drafts,
      count(*) filter (
        where client_hash = ${client} and created_at >= ${new Date(hourAgo)} and kind = 'health'
      )::int as client_health
    from ai_usage
    where created_at >= ${new Date(Math.min(dayStart, hourAgo))}
  `;
  return { total: row.total, client: row.client, classDrafts: row.class_drafts, clientHealth: row.client_health };
}

async function recordUsage(
  kind: UsageKind,
  client: string,
  classCode: string | null,
  memoryOnly = false,
): Promise<void> {
  const sql = memoryOnly ? null : dbOrNull();
  if (!sql) {
    memory.push({ kind, client, classCode, at: Date.now() });
    // Keep the fallback log small: nothing older than a day matters.
    const cutoff = Date.now() - 25 * 60 * 60 * 1000;
    while (memory.length && memory[0].at < cutoff) memory.shift();
    return;
  }
  await sql`insert into ai_usage (kind, client_hash, class_code) values (${kind}, ${client}, ${classCode})`;
  // Occasionally clear out rows older than two days.
  if (Math.random() < 0.02) {
    await sql`delete from ai_usage where created_at < now() - interval '2 days'`;
  }
}

// Throws UsageLimitError if this request would go over a limit; otherwise records it.
// If the database can't be reached, the in-memory guard is used instead of blocking practice.
export async function checkUsage(kind: UsageKind, request: Request, classCode: string | null = null): Promise<void> {
  const client = clientId(request);
  let counts: Counts;
  let useMemory = false;
  try {
    counts = await countUsage(client, classCode);
  } catch (error) {
    console.error("Usage check fell back to memory:", error);
    useMemory = true;
    counts = await countUsage(client, classCode, true);
  }

  if (counts.total >= limits.dailyTotal()) throw new UsageLimitError(MESSAGES.daily);
  if (kind === "health") {
    if (counts.clientHealth >= limits.healthPerClientHourly()) throw new UsageLimitError(MESSAGES.health);
  } else if (counts.client >= limits.perClientHourly()) {
    throw new UsageLimitError(MESSAGES.client);
  }
  if (kind === "draft" && classCode && counts.classDrafts >= limits.draftsPerClassDaily()) {
    throw new UsageLimitError(MESSAGES.drafts);
  }

  try {
    await recordUsage(kind, client, classCode, useMemory);
  } catch (error) {
    console.error("Recording usage fell back to memory:", error);
    await recordUsage(kind, client, classCode, true);
  }
}
