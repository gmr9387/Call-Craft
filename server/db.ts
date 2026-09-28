import { createHash, randomBytes, randomInt } from "node:crypto";
import postgres from "postgres";
import type { Scenario, Turn } from "../shared/scenarios.js";
import type { ScorecardResult } from "../shared/scorecard.js";
import type { ScenarioInputValue } from "../shared/scenarioInput.js";
import type { ClassDashboard, ClassInfo, JoinResult, SavedAttempt } from "../shared/classes.js";

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

export async function joinClass(classCode: string): Promise<JoinResult | null> {
  const rows = await db()`
    select id, name, class_code from classes where class_code = ${normalizeClassCode(classCode)}
  `;
  if (!rows.length) return null;
  return {
    classInfo: { name: rows[0].name, classCode: rows[0].class_code },
    scenarios: await listScenarios(rows[0].id, false),
  };
}

export interface NewAttempt {
  classCode: string;
  agentName: string;
  scenarioId: string;
  scenarioTitle: string;
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
      class_id, agent_name, scenario_id, scenario_title, started_at, duration_sec,
      overall_score, result, transcript, scorecard
    )
    select id, ${a.agentName}, ${a.scenarioId}, ${a.scenarioTitle}, ${a.startedAt}, ${a.durationSec},
      ${score}, ${a.scorecard.result}, ${db().json(a.transcript as never)}, ${db().json(a.scorecard as never)}
    from classes
    where class_code = ${normalizeClassCode(a.classCode)}
    returning id
  `;
  return rows.length ? rows[0].id : null;
}

const DASHBOARD_LIMIT = 500;

interface ClassRow {
  id: string;
  name: string;
  class_code: string;
}

async function classForTrainer(trainerKey: string): Promise<ClassRow | null> {
  const rows = await db()<ClassRow[]>`
    select id, name, class_code from classes where trainer_key_hash = ${hashKey(trainerKey.trim())}
  `;
  return rows[0] ?? null;
}

export async function classDashboard(trainerKey: string): Promise<ClassDashboard | null> {
  const cls = await classForTrainer(trainerKey);
  if (!cls) return null;

  const rows = await db()`
    select id, agent_name, scenario_id, scenario_title, started_at, duration_sec, transcript, scorecard
    from attempts
    where class_id = ${cls.id}
    order by created_at desc
    limit ${DASHBOARD_LIMIT}
  `;

  const attempts: SavedAttempt[] = rows.map((r) => ({
    id: r.id,
    agentName: r.agent_name,
    scenarioId: r.scenario_id,
    scenarioTitle: r.scenario_title ?? undefined,
    startedAt: new Date(r.started_at).toISOString(),
    durationSec: r.duration_sec,
    transcript: r.transcript,
    scorecard: r.scorecard,
  }));

  return {
    classInfo: { name: cls.name, classCode: cls.class_code },
    attempts,
    scenarios: await listScenarios(cls.id, true),
  };
}

// ---- Trainer-built scenarios ----

export const MAX_SCENARIOS_PER_CLASS = 50;

export class ScenarioLimitError extends Error {
  constructor() {
    super(`A class can have up to ${MAX_SCENARIOS_PER_CLASS} scenarios. Archive or edit an existing one instead.`);
  }
}

interface ScenarioRow {
  id: string;
  title: string;
  difficulty: Scenario["difficulty"];
  focus: string;
  lead_name: string;
  program: string;
  persona: string;
  success_criteria: string[];
  not_applicable: string[];
  archived: boolean;
}

function toScenario(r: ScenarioRow): Scenario {
  return {
    id: r.id,
    title: r.title,
    difficulty: r.difficulty,
    focus: r.focus,
    leadName: r.lead_name,
    program: r.program,
    persona: r.persona,
    successCriteria: r.success_criteria,
    notApplicable: r.not_applicable,
    custom: true,
    archived: r.archived,
  };
}

async function listScenarios(classId: string, includeArchived: boolean): Promise<Scenario[]> {
  const rows = await db()<ScenarioRow[]>`
    select id, title, difficulty, focus, lead_name, program, persona, success_criteria, not_applicable, archived
    from scenarios
    where class_id = ${classId} ${includeArchived ? db()`` : db()`and not archived`}
    order by created_at
  `;
  return rows.map(toScenario);
}

// A trainer-built scenario, only if it belongs to the class with this code.
// Archived scenarios still resolve so calls already in progress can finish and be scored.
export async function scenarioForClass(id: string, classCode: string): Promise<Scenario | null> {
  const rows = await db()<ScenarioRow[]>`
    select s.id, s.title, s.difficulty, s.focus, s.lead_name, s.program, s.persona,
      s.success_criteria, s.not_applicable, s.archived
    from scenarios s
    join classes c on c.id = s.class_id
    where s.id = ${id} and c.class_code = ${normalizeClassCode(classCode)}
  `;
  return rows[0] ? toScenario(rows[0]) : null;
}

export async function isTrainerKeyValid(trainerKey: string): Promise<boolean> {
  return (await classForTrainer(trainerKey)) !== null;
}

// Returns null when the trainer key isn't recognized.
export async function createScenario(trainerKey: string, input: ScenarioInputValue): Promise<Scenario | null> {
  const cls = await classForTrainer(trainerKey);
  if (!cls) return null;
  const [{ count }] = await db()`select count(*)::int as count from scenarios where class_id = ${cls.id}`;
  if (count >= MAX_SCENARIOS_PER_CLASS) throw new ScenarioLimitError();
  const rows = await db()<ScenarioRow[]>`
    insert into scenarios (
      class_id, title, difficulty, focus, lead_name, program, persona, success_criteria, not_applicable
    ) values (
      ${cls.id}, ${input.title}, ${input.difficulty}, ${input.focus}, ${input.leadName}, ${input.program},
      ${input.persona}, ${db().json(input.successCriteria)}, ${db().json(input.notApplicable)}
    )
    returning id, title, difficulty, focus, lead_name, program, persona, success_criteria, not_applicable, archived
  `;
  return toScenario(rows[0]);
}

// Returns null when the trainer key or scenario isn't found in that trainer's class.
export async function updateScenario(
  trainerKey: string,
  id: string,
  input: ScenarioInputValue,
): Promise<Scenario | null> {
  const cls = await classForTrainer(trainerKey);
  if (!cls) return null;
  const rows = await db()<ScenarioRow[]>`
    update scenarios set
      title = ${input.title},
      difficulty = ${input.difficulty},
      focus = ${input.focus},
      lead_name = ${input.leadName},
      program = ${input.program},
      persona = ${input.persona},
      success_criteria = ${db().json(input.successCriteria)},
      not_applicable = ${db().json(input.notApplicable)},
      updated_at = now()
    where id = ${id} and class_id = ${cls.id}
    returning id, title, difficulty, focus, lead_name, program, persona, success_criteria, not_applicable, archived
  `;
  return rows[0] ? toScenario(rows[0]) : null;
}

export async function setScenarioArchived(trainerKey: string, id: string, archived: boolean): Promise<Scenario | null> {
  const cls = await classForTrainer(trainerKey);
  if (!cls) return null;
  const rows = await db()<ScenarioRow[]>`
    update scenarios set archived = ${archived}, updated_at = now()
    where id = ${id} and class_id = ${cls.id}
    returning id, title, difficulty, focus, lead_name, program, persona, success_criteria, not_applicable, archived
  `;
  return rows[0] ? toScenario(rows[0]) : null;
}
