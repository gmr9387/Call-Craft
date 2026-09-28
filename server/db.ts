import { createHash, randomBytes, randomInt } from "node:crypto";
import postgres from "postgres";
import type { Turn } from "../shared/scenarios.js";
import type { ScorecardResult } from "../shared/scorecard.js";
import type { ClassDashboard, ClassInfo, SavedAttempt } from "../shared/classes.js";

export class DbNotConfiguredError extends Error {
  constructor() {
    super("Class features need a database: set DATABASE_URL on the server.");
  }
}

let sql: postgres.Sql | undefined;

function db(): postgres.Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new DbNotConfiguredError();
  // prepare: false keeps this compatible with transaction-mode poolers (Supabase, Neon, PgBouncer).
  sql ??= postgres(url, { prepare: false, max: 3, idle_timeout: 20 });
  return sql;
}

export function isDbConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}

// No 0/O or 1/I/L, so codes are easy to read aloud and type.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function newClassCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function normalizeClassCode(code: string): string {
  return code.trim().toUpperCase();
}

export async function createClass(name: string): Promise<{ classInfo: ClassInfo; trainerKey: string }> {
  const trainerKey = randomBytes(18).toString("base64url");
  // Retry on the (unlikely) chance of a class code collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const classCode = newClassCode();
    const rows = await db()`
      insert into classes (name, class_code, trainer_key_hash)
      values (${name}, ${classCode}, ${hashKey(trainerKey)})
      on conflict (class_code) do nothing
      returning name, class_code
    `;
    if (rows.length) {
      return { classInfo: { name: rows[0].name, classCode: rows[0].class_code }, trainerKey };
    }
  }
  throw new Error("Could not generate a unique class code.");
}

export async function findClass(classCode: string): Promise<ClassInfo | null> {
  const rows = await db()`
    select name, class_code from classes where class_code = ${normalizeClassCode(classCode)}
  `;
  return rows.length ? { name: rows[0].name, classCode: rows[0].class_code } : null;
}

export interface NewAttempt {
  classCode: string;
  agentName: string;
  scenarioId: string;
  startedAt: string;
  durationSec: number;
  transcript: Turn[];
  scorecard: ScorecardResult;
}

// Returns the saved attempt id, or null if the class code doesn't exist.
export async function saveAttempt(a: NewAttempt): Promise<string | null> {
  const score = Math.min(100, Math.max(0, Math.round(a.scorecard.overall_score)));
  const rows = await db()`
    insert into attempts (
      class_id, agent_name, scenario_id, started_at, duration_sec,
      overall_score, result, transcript, scorecard
    )
    select id, ${a.agentName}, ${a.scenarioId}, ${a.startedAt}, ${a.durationSec},
      ${score}, ${a.scorecard.result}, ${db().json(a.transcript as never)}, ${db().json(a.scorecard as never)}
    from classes
    where class_code = ${normalizeClassCode(a.classCode)}
    returning id
  `;
  return rows.length ? rows[0].id : null;
}

const DASHBOARD_LIMIT = 500;

export async function classDashboard(trainerKey: string): Promise<ClassDashboard | null> {
  const classes = await db()`
    select id, name, class_code from classes where trainer_key_hash = ${hashKey(trainerKey.trim())}
  `;
  if (!classes.length) return null;
  const cls = classes[0];

  const rows = await db()`
    select id, agent_name, scenario_id, started_at, duration_sec, transcript, scorecard
    from attempts
    where class_id = ${cls.id}
    order by created_at desc
    limit ${DASHBOARD_LIMIT}
  `;

  const attempts: SavedAttempt[] = rows.map((r) => ({
    id: r.id,
    agentName: r.agent_name,
    scenarioId: r.scenario_id,
    startedAt: new Date(r.started_at).toISOString(),
    durationSec: r.duration_sec,
    transcript: r.transcript,
    scorecard: r.scorecard,
  }));

  return { classInfo: { name: cls.name, classCode: cls.class_code }, attempts };
}
