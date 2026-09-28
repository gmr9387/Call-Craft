import { createHash } from "node:crypto";
import { dbOrNull } from "./db.js";
import { env } from "./env.js";
import { getSettings } from "./settings.js";

// Spending guardrails. Every AI request is checked against these limits before it runs,
// so a runaway script or a leaked link can't drain the Anthropic balance.
// Each limit can be changed per deployment with the environment variable named next to it.

export type UsageKind = "reply" | "score" | "draft" | "health";
type LoggedKind = UsageKind | "signin";

function limit(name: string, fallback: number): number {
  const value = Number(env(name));
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

// The three spending limits an admin can change on the System page. A value saved there
// wins over the environment variable, which wins over the default.
export interface SpendingLimits {
  // All AI requests across the whole site in one UTC day. The main budget backstop.
  dailyTotal: number;
  // AI requests from one person (or, when not signed in, one IP address) in the last hour.
  perClientHourly: number;
  // Scenario and call flow drafts ("Write it for me") per class per UTC day.
  draftsPerClassDaily: number;
}

export async function spendingLimits(): Promise<SpendingLimits> {
  const saved = (await getSettings()).limits ?? {};
  return {
    dailyTotal: saved.dailyTotal ?? limit("CALLCRAFT_DAILY_AI_LIMIT", 1500),
    perClientHourly: saved.perClientHourly ?? limit("CALLCRAFT_HOURLY_CLIENT_LIMIT", 120),
    draftsPerClassDaily: saved.draftsPerClassDaily ?? limit("CALLCRAFT_DAILY_DRAFT_LIMIT", 25),
  };
}

export const limits = {
  // Health-check AI pings from one computer per hour.
  healthPerClientHourly: () => limit("CALLCRAFT_HOURLY_HEALTH_LIMIT", 10),
  // Failed sign-ins (wrong password, unknown class code) from one IP address per hour.
  signinFailuresHourly: () => limit("CALLCRAFT_HOURLY_SIGNIN_FAILURES", 20),
};

export class UsageLimitError extends Error {}

const MESSAGES = {
  daily: "CallCraft has reached today's practice limit. Please try again tomorrow.",
  client: "You're going a little fast. Wait a few minutes and try again.",
  drafts: "This class has used today's scenario drafts. You can still write scenarios by hand.",
  health: "Too many health checks from this computer. Try again later.",
  signin: "Too many tries from this computer. Wait a while and try again, or ask your trainer for help.",
  account: "Too many wrong passwords for this account. Wait an hour, or ask your trainer for a reset link.",
} as const;

// A salted hash of the signed-in person's id, or of the caller's IP address when there is no
// account, so usage can be counted without storing either. Counting per person keeps a whole
// training room behind one office IP address from sharing one limit.
export function clientId(request: Request, userId: string | null = null): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
  const salt = env("CALLCRAFT_USAGE_SALT") ?? "callcraft";
  const who = userId ? `user:${userId}` : `ip:${ip}`;
  return createHash("sha256").update(`${salt}:${who}`).digest("hex").slice(0, 32);
}

// In-memory fallback when there's no database. Per server instance, so looser, but still a guard.
const memory: { kind: LoggedKind; client: string; classCode: string | null; at: number }[] = [];

function startOfUtcDay(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

interface Counts {
  total: number;
  client: number;
  classDrafts: number;
  clientHealth: number;
  clientSignin: number;
}

async function countUsage(client: string, classCode: string | null, memoryOnly = false): Promise<Counts> {
  const now = Date.now();
  const dayStart = startOfUtcDay(now);
  const hourAgo = now - 60 * 60 * 1000;
  const sql = memoryOnly ? null : dbOrNull();

  if (!sql) {
    const today = memory.filter((m) => m.at >= dayStart && m.kind !== "signin");
    const recent = memory.filter((m) => m.client === client && m.at >= hourAgo);
    return {
      total: today.length,
      client: recent.filter((m) => m.kind !== "health" && m.kind !== "signin").length,
      classDrafts: classCode ? today.filter((m) => m.kind === "draft" && m.classCode === classCode).length : 0,
      clientHealth: recent.filter((m) => m.kind === "health").length,
      clientSignin: recent.filter((m) => m.kind === "signin").length,
    };
  }

  const [row] = await sql`
    select
      count(*) filter (where created_at >= ${new Date(dayStart)} and kind <> 'signin')::int as total,
      count(*) filter (
        where client_hash = ${client} and created_at >= ${new Date(hourAgo)} and kind not in ('health', 'signin')
      )::int as client,
      count(*) filter (
        where kind = 'draft' and class_code = ${classCode} and created_at >= ${new Date(dayStart)}
      )::int as class_drafts,
      count(*) filter (
        where client_hash = ${client} and created_at >= ${new Date(hourAgo)} and kind = 'health'
      )::int as client_health,
      count(*) filter (
        where client_hash = ${client} and created_at >= ${new Date(hourAgo)} and kind = 'signin'
      )::int as client_signin
    from ai_usage
    where created_at >= ${new Date(Math.min(dayStart, hourAgo))}
  `;
  return {
    total: row.total,
    client: row.client,
    classDrafts: row.class_drafts,
    clientHealth: row.client_health,
    clientSignin: row.client_signin,
  };
}

async function recordUsage(
  kind: LoggedKind,
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

// Counts from the database, or from memory if the database can't be reached,
// so a database hiccup never blocks practice.
async function safeCounts(client: string, classCode: string | null): Promise<{ counts: Counts; useMemory: boolean }> {
  try {
    return { counts: await countUsage(client, classCode), useMemory: false };
  } catch (error) {
    console.error("Usage check fell back to memory:", error);
    return { counts: await countUsage(client, classCode, true), useMemory: true };
  }
}

async function safeRecord(kind: LoggedKind, client: string, classCode: string | null, useMemory: boolean) {
  try {
    await recordUsage(kind, client, classCode, useMemory);
  } catch (error) {
    console.error("Recording usage fell back to memory:", error);
    await recordUsage(kind, client, classCode, true);
  }
}

// Throws UsageLimitError if this request would go over a limit; otherwise records it.
export async function checkUsage(
  kind: UsageKind,
  request: Request,
  classCode: string | null = null,
  userId: string | null = null,
): Promise<void> {
  const client = clientId(request, userId);
  const { counts, useMemory } = await safeCounts(client, classCode);

  const spend = await spendingLimits();
  if (counts.total >= spend.dailyTotal) throw new UsageLimitError(MESSAGES.daily);
  if (kind === "health") {
    if (counts.clientHealth >= limits.healthPerClientHourly()) throw new UsageLimitError(MESSAGES.health);
  } else if (counts.client >= spend.perClientHourly) {
    throw new UsageLimitError(MESSAGES.client);
  }
  if (kind === "draft" && classCode && counts.classDrafts >= spend.draftsPerClassDaily) {
    throw new UsageLimitError(MESSAGES.drafts);
  }

  await safeRecord(kind, client, classCode, useMemory);
}

// Sign-in guard: throws when this IP address has failed too many times in the last hour.
// A salted hash standing for one email address, so failed sign-ins to one account can be
// counted across every computer they come from.
function accountId(email: string): string {
  const salt = env("CALLCRAFT_USAGE_SALT") ?? "callcraft";
  return createHash("sha256").update(`${salt}:email:${email.trim().toLowerCase()}`).digest("hex").slice(0, 32);
}

// Throws when this computer, or (for password sign-in) this account, failed too often in the last hour.
export async function checkSigninAllowed(request: Request, email?: string): Promise<void> {
  const max = limits.signinFailuresHourly();
  if ((await safeCounts(clientId(request), null)).counts.clientSignin >= max) throw new UsageLimitError(MESSAGES.signin);
  if (email && (await safeCounts(accountId(email), null)).counts.clientSignin >= max) {
    throw new UsageLimitError(MESSAGES.account);
  }
}

export async function recordSigninFailure(request: Request, email?: string): Promise<void> {
  await safeRecord("signin", clientId(request), null, false);
  if (email) await safeRecord("signin", accountId(email), null, false);
}

export interface UsageSummary {
  today: Record<UsageKind, number>;
  lastHour: number;
  // AI requests per UTC day for the last 7 days, oldest first.
  week: { day: string; count: number }[];
}

// AI request counts for the admin's System page (from the usage log, so it needs a database).
export async function usageSummary(): Promise<UsageSummary> {
  const sql = dbOrNull();
  const today: Record<UsageKind, number> = { reply: 0, score: 0, draft: 0, health: 0 };
  if (!sql) return { today, lastHour: 0, week: [] };
  const now = Date.now();
  const dayStart = startOfUtcDay(now);
  const weekStart = dayStart - 6 * 24 * 60 * 60 * 1000;
  const [byKind, [hour], byDay] = await Promise.all([
    sql`
      select kind, count(*)::int as count from ai_usage
      where created_at >= ${new Date(dayStart)} and kind <> 'signin' group by kind
    `,
    sql`
      select count(*)::int as count from ai_usage
      where created_at >= ${new Date(now - 60 * 60 * 1000)} and kind <> 'signin'
    `,
    sql`
      select to_char(date_trunc('day', created_at at time zone 'UTC'), 'YYYY-MM-DD') as day, count(*)::int as count
      from ai_usage where created_at >= ${new Date(weekStart)} and kind <> 'signin'
      group by 1
    `,
  ]);
  for (const r of byKind) today[r.kind as UsageKind] = r.count;
  const counts = new Map(byDay.map((r) => [r.day as string, r.count as number]));
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(weekStart + i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return { day, count: counts.get(day) ?? 0 };
  });
  return { today, lastHour: hour.count, week };
}
