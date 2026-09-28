import { dbOrNull } from "./db.js";

// Small key-value settings kept in the database: spending limits set by an admin in the app,
// and the most recent AI problem (so admins and trainers see it without opening Vercel).

export interface LimitSettings {
  dailyTotal?: number;
  perClientHourly?: number;
  draftsPerClassDaily?: number;
}

export interface AiProblem {
  message: string;
  at: string;
}

type Settings = { limits?: LimitSettings; ai_problem?: AiProblem };

const CACHE_MS = 30_000;
let cache: { at: number; value: Settings } | null = null;

// Cached for 30 seconds per server instance. Never throws: settings are optional.
export async function getSettings(): Promise<Settings> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const sql = dbOrNull();
  if (!sql) return {};
  try {
    const rows = await sql`select key, value from app_settings`;
    const value: Settings = {};
    for (const r of rows) (value as Record<string, unknown>)[r.key] = r.value;
    cache = { at: Date.now(), value };
    return value;
  } catch (error) {
    console.error("Reading settings failed:", error);
    return cache?.value ?? {};
  }
}

async function setSetting(key: keyof Settings, value: unknown): Promise<void> {
  const sql = dbOrNull();
  if (!sql) return;
  await sql`
    insert into app_settings (key, value, updated_at) values (${key}, ${sql.json(value as never)}, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
  cache = null;
}

export async function saveLimitSettings(limits: LimitSettings): Promise<void> {
  await setSetting("limits", limits);
}

// Remembers an AI failure (bad key, no credit, outage). Never throws.
export async function noteAiProblem(message: string): Promise<void> {
  try {
    await setSetting("ai_problem", { message, at: new Date().toISOString() } satisfies AiProblem);
  } catch (error) {
    console.error("Recording the AI problem failed:", error);
  }
}

export async function clearAiProblem(): Promise<void> {
  const sql = dbOrNull();
  if (!sql) return;
  await sql`delete from app_settings where key = 'ai_problem'`;
  cache = null;
}

// The last AI problem, if it happened within the last hour.
export async function recentAiProblem(): Promise<AiProblem | null> {
  const problem = (await getSettings()).ai_problem;
  if (!problem) return null;
  return Date.now() - new Date(problem.at).getTime() < 60 * 60 * 1000 ? problem : null;
}
