import { randomInt } from "node:crypto";
import postgres from "postgres";
import { env } from "./env.js";
import type { Scenario, Turn } from "../shared/scenarios.js";
import type { ScorecardResult } from "../shared/scorecard.js";
import type { ScenarioInputValue } from "../shared/scenarioInput.js";
import type {
  ClassAgent,
  ClassDashboard,
  ClassInfo,
  ClassSummary,
  JoinResult,
  SavedAttempt,
} from "../shared/classes.js";

export class DbNotConfiguredError extends Error {
  constructor() {
    super("Class features need a database: set DATABASE_URL on the server.");
  }
}

let sql: postgres.Sql | undefined;

export function db(): postgres.Sql {
  const url = env("DATABASE_URL");
  if (!url) throw new DbNotConfiguredError();
  // prepare: false keeps this compatible with transaction-mode poolers (Supabase, Neon, PgBouncer).
  sql ??= postgres(url, { prepare: false, max: 3, idle_timeout: 20 });
  return sql;
}

// The shared connection, or null when no database is configured.
export function dbOrNull(): postgres.Sql | null {
  return env("DATABASE_URL") ? db() : null;
}

export async function pingDb(): Promise<void> {
  await db()`select 1 from classes limit 1`;
  await db()`select 1 from users limit 1`;
}

export function isDbConfigured(): boolean {
  return !!env("DATABASE_URL");
}

// No 0/O or 1/I/L, so codes are easy to read aloud and type.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function newClassCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export function normalizeClassCode(code: string): string {
  return code.trim().toUpperCase();
}

interface ClassRow {
  id: string;
  name: string;
  class_code: string;
  trainer_id: string | null;
}

const toClassInfo = (r: ClassRow): ClassInfo => ({ id: r.id, name: r.name, classCode: r.class_code });

// ---- Classes ----

export async function createClass(trainerId: string, name: string): Promise<ClassInfo> {
  // Retry on the (unlikely) chance of a class code collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const rows = await db()<ClassRow[]>`
      insert into classes (name, class_code, trainer_id)
      values (${name}, ${newClassCode()}, ${trainerId})
      on conflict (class_code) do nothing
      returning id, name, class_code, trainer_id
    `;
    if (rows.length) return toClassInfo(rows[0]);
  }
  throw new Error("Could not generate a unique class code.");
}

export async function classById(id: string): Promise<(ClassInfo & { trainerId: string | null }) | null> {
  const rows = await db()<ClassRow[]>`select id, name, class_code, trainer_id from classes where id = ${id}`;
  return rows[0] ? { ...toClassInfo(rows[0]), trainerId: rows[0].trainer_id } : null;
}

// Classes a trainer runs, or every class when trainerId is null (admins).
export async function listClasses(trainerId: string | null): Promise<ClassSummary[]> {
  const rows = await db()`
    select c.id, c.name, c.class_code, t.name as trainer_name,
      (select count(*)::int from users u where u.class_id = c.id and u.role = 'agent') as agent_count,
      (select count(*)::int from attempts a where a.class_id = c.id) as call_count,
      (select max(a.created_at) from attempts a where a.class_id = c.id) as last_call_at
    from classes c
    left join users t on t.id = c.trainer_id
    where ${trainerId ? db()`c.trainer_id = ${trainerId}` : db()`true`}
    order by c.created_at desc
  `;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    classCode: r.class_code,
    trainerName: r.trainer_name ?? null,
    agentCount: r.agent_count,
    callCount: r.call_count,
    lastCallAt: r.last_call_at ? new Date(r.last_call_at).toISOString() : null,
  }));
}

const DASHBOARD_LIMIT = 1000;

function toAttempt(r: postgres.Row): SavedAttempt {
  return {
    id: r.id,
    userId: r.user_id ?? undefined,
    agentName: r.agent_name,
    scenarioId: r.scenario_id,
    scenarioTitle: r.scenario_title ?? undefined,
    startedAt: new Date(r.started_at).toISOString(),
    durationSec: r.duration_sec,
    transcript: r.transcript,
    scorecard: r.scorecard,
  };
}

export async function classDashboard(classId: string): Promise<ClassDashboard | null> {
  const cls = await classById(classId);
  if (!cls) return null;

  const [attempts, agents, scenarios] = await Promise.all([
    db()`
      select id, user_id, agent_name, scenario_id, scenario_title, started_at, duration_sec, transcript, scorecard
      from attempts
      where class_id = ${classId}
      order by created_at desc
      limit ${DASHBOARD_LIMIT}
    `,
    db()`
      select id, name, email, disabled, last_seen_at
      from users
      where class_id = ${classId} and role = 'agent'
      order by name
    `,
    listScenarios(classId, true),
  ]);

  return {
    classInfo: { id: cls.id, name: cls.name, classCode: cls.classCode },
    attempts: attempts.map(toAttempt),
    scenarios,
    agents: agents.map(
      (r): ClassAgent => ({
        id: r.id,
        name: r.name,
        email: r.email,
        disabled: r.disabled,
        lastSeenAt: r.last_seen_at ? new Date(r.last_seen_at).toISOString() : null,
      }),
    ),
  };
}

export async function classByCode(code: string): Promise<ClassInfo | null> {
  const rows = await db()<ClassRow[]>`
    select id, name, class_code, trainer_id from classes where class_code = ${normalizeClassCode(code)}
  `;
  return rows[0] ? toClassInfo(rows[0]) : null;
}

// What an agent in this class sees: the class and its active trainer-built scenarios.
export async function classForAgent(classId: string): Promise<JoinResult | null> {
  const cls = await classById(classId);
  if (!cls) return null;
  return {
    classInfo: { id: cls.id, name: cls.name, classCode: cls.classCode },
    scenarios: await listScenarios(cls.id, false),
  };
}

// Moves an agent into the class with this code. Returns null if the code doesn't exist.
export async function joinClass(userId: string, classCode: string): Promise<JoinResult | null> {
  const cls = await classByCode(classCode);
  if (!cls) return null;
  await db()`update users set class_id = ${cls.id} where id = ${userId}`;
  return classForAgent(cls.id);
}

// Returns false when the agent isn't in that class.
export async function removeAgentFromClass(classId: string, userId: string): Promise<boolean> {
  const rows = await db()`
    update users set class_id = null
    where id = ${userId} and class_id = ${classId} and role = 'agent'
    returning id
  `;
  return rows.length > 0;
}

// ---- Calls ----

export interface NewAttempt {
  userId: string;
  classId: string | null;
  agentName: string;
  scenarioId: string;
  scenarioTitle: string;
  startedAt: string;
  durationSec: number;
  transcript: Turn[];
  scorecard: ScorecardResult;
}

export async function saveAttempt(a: NewAttempt): Promise<string> {
  const score = Math.min(100, Math.max(0, Math.round(a.scorecard.overall_score)));
  const rows = await db()`
    insert into attempts (
      class_id, user_id, agent_name, scenario_id, scenario_title, started_at, duration_sec,
      overall_score, result, transcript, scorecard
    ) values (
      ${a.classId}, ${a.userId}, ${a.agentName}, ${a.scenarioId}, ${a.scenarioTitle}, ${a.startedAt},
      ${a.durationSec}, ${score}, ${a.scorecard.result}, ${db().json(a.transcript as never)},
      ${db().json(a.scorecard as never)}
    )
    returning id
  `;
  return rows[0].id;
}

const MY_CALLS_LIMIT = 300;

export async function myAttempts(userId: string): Promise<SavedAttempt[]> {
  const rows = await db()`
    select id, user_id, agent_name, scenario_id, scenario_title, started_at, duration_sec, transcript, scorecard
    from attempts
    where user_id = ${userId}
    order by created_at desc
    limit ${MY_CALLS_LIMIT}
  `;
  return rows.map(toAttempt);
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
  class_id: string;
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
    select id, class_id, title, difficulty, focus, lead_name, program, persona, success_criteria, not_applicable, archived
    from scenarios
    where class_id = ${classId} ${includeArchived ? db()`` : db()`and not archived`}
    order by created_at
  `;
  return rows.map(toScenario);
}

// A trainer-built scenario and the class it belongs to. Archived scenarios still resolve,
// so calls already in progress can finish and be scored.
export async function scenarioWithClass(id: string): Promise<{ scenario: Scenario; classId: string } | null> {
  const rows = await db()<ScenarioRow[]>`
    select id, class_id, title, difficulty, focus, lead_name, program, persona, success_criteria, not_applicable, archived
    from scenarios
    where id = ${id}
  `;
  return rows[0] ? { scenario: toScenario(rows[0]), classId: rows[0].class_id } : null;
}

export async function createScenario(classId: string, input: ScenarioInputValue): Promise<Scenario> {
  const [{ count }] = await db()`select count(*)::int as count from scenarios where class_id = ${classId}`;
  if (count >= MAX_SCENARIOS_PER_CLASS) throw new ScenarioLimitError();
  const rows = await db()<ScenarioRow[]>`
    insert into scenarios (
      class_id, title, difficulty, focus, lead_name, program, persona, success_criteria, not_applicable
    ) values (
      ${classId}, ${input.title}, ${input.difficulty}, ${input.focus}, ${input.leadName}, ${input.program},
      ${input.persona}, ${db().json(input.successCriteria)}, ${db().json(input.notApplicable)}
    )
    returning id, class_id, title, difficulty, focus, lead_name, program, persona, success_criteria, not_applicable, archived
  `;
  return toScenario(rows[0]);
}

// Returns null when the scenario isn't in that class.
export async function updateScenario(
  classId: string,
  id: string,
  input: ScenarioInputValue,
): Promise<Scenario | null> {
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
    where id = ${id} and class_id = ${classId}
    returning id, class_id, title, difficulty, focus, lead_name, program, persona, success_criteria, not_applicable, archived
  `;
  return rows[0] ? toScenario(rows[0]) : null;
}

export async function setScenarioArchived(classId: string, id: string, archived: boolean): Promise<Scenario | null> {
  const rows = await db()<ScenarioRow[]>`
    update scenarios set archived = ${archived}, updated_at = now()
    where id = ${id} and class_id = ${classId}
    returning id, class_id, title, difficulty, focus, lead_name, program, persona, success_criteria, not_applicable, archived
  `;
  return rows[0] ? toScenario(rows[0]) : null;
}
