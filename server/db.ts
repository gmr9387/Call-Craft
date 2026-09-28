import { randomInt } from "node:crypto";
import postgres from "postgres";
import { env } from "./env.js";
import type { Scenario, Turn } from "../shared/scenarios.js";
import type { ScorecardResult } from "../shared/scorecard.js";
import type { ScenarioInputValue } from "../shared/scenarioInput.js";
import { BUILTIN_FLOW } from "../shared/flows.js";
import { flowById } from "./flows.js";
import type { CallFlow } from "../shared/flows.js";
import type {
  CallResult,
  ClassAgent,
  ClassDashboard,
  ClassInfo,
  ClassSummary,
  JoinResult,
  Requirements,
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
  flow_id: string | null;
  archived: boolean;
  required_scenarios: string[];
  pass_score: number;
}

const CLASS_COLUMNS = "id, name, class_code, trainer_id, flow_id, archived, required_scenarios, pass_score";

export interface ClassRecord extends ClassInfo {
  trainerId: string | null;
  // null means the built-in sample flow.
  flowId: string | null;
  archived: boolean;
  requirements: Requirements;
}

const toClassInfo = (r: ClassRow): ClassInfo => ({ id: r.id, name: r.name, classCode: r.class_code });

function toClassRecord(r: ClassRow): ClassRecord {
  return {
    ...toClassInfo(r),
    trainerId: r.trainer_id,
    flowId: r.flow_id,
    archived: r.archived,
    requirements: { scenarioIds: r.required_scenarios, passScore: r.pass_score },
  };
}

// The call flow a class (or scenario) uses; null is the built-in sample.
export async function resolveFlow(flowId: string | null): Promise<CallFlow> {
  return (flowId ? await flowById(flowId) : null) ?? BUILTIN_FLOW;
}

// ---- Classes ----

// flowId null means the built-in sample flow.
export async function createClass(trainerId: string, name: string, flowId: string | null): Promise<ClassInfo> {
  // Retry on the (unlikely) chance of a class code collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const rows = await db()<ClassRow[]>`
      insert into classes (name, class_code, trainer_id, flow_id)
      values (${name}, ${newClassCode()}, ${trainerId}, ${flowId})
      on conflict (class_code) do nothing
      returning ${db().unsafe(CLASS_COLUMNS)}
    `;
    if (rows.length) return toClassInfo(rows[0]);
  }
  throw new Error("Could not generate a unique class code.");
}

export async function classById(id: string): Promise<ClassRecord | null> {
  const rows = await db()<ClassRow[]>`select ${db().unsafe(CLASS_COLUMNS)} from classes where id = ${id}`;
  return rows[0] ? toClassRecord(rows[0]) : null;
}

// Classes a trainer runs, or every class when trainerId is null (admins).
export async function listClasses(trainerId: string | null): Promise<ClassSummary[]> {
  const rows = await db()`
    select c.id, c.name, c.class_code, c.archived, c.trainer_id, t.name as trainer_name,
      coalesce(f.name, ${BUILTIN_FLOW.name}) as flow_name,
      (select count(*)::int from users u where u.class_id = c.id and u.role = 'agent') as agent_count,
      (select count(*)::int from attempts a where a.class_id = c.id) as call_count,
      (select max(a.created_at) from attempts a where a.class_id = c.id) as last_call_at
    from classes c
    left join users t on t.id = c.trainer_id
    left join call_flows f on f.id = c.flow_id
    where ${trainerId ? db()`c.trainer_id = ${trainerId}` : db()`true`}
    order by c.archived, c.created_at desc
  `;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    classCode: r.class_code,
    trainerId: r.trainer_id ?? null,
    trainerName: r.trainer_name ?? null,
    flowName: r.flow_name,
    archived: r.archived,
    agentCount: r.agent_count,
    callCount: r.call_count,
    lastCallAt: r.last_call_at ? new Date(r.last_call_at).toISOString() : null,
  }));
}

const DASHBOARD_LIMIT = 1000;

const ATTEMPT_COLUMNS = `id, user_id, agent_name, scenario_id, scenario_title, started_at, duration_sec, transcript,
  scorecard, review_note, review_score, review_result, reviewed_by_name, reviewed_at`;

// The same, without the conversation, for lists (the conversation loads when a call is opened).
const ATTEMPT_LIST_COLUMNS = ATTEMPT_COLUMNS.replace("transcript,", "");

function toAttempt(r: postgres.Row): SavedAttempt {
  const partial = r.transcript === undefined;
  return {
    ...(partial ? { partial: true } : {}),
    id: r.id,
    userId: r.user_id ?? undefined,
    agentName: r.agent_name,
    scenarioId: r.scenario_id,
    scenarioTitle: r.scenario_title ?? undefined,
    startedAt: new Date(r.started_at).toISOString(),
    durationSec: r.duration_sec,
    transcript: r.transcript ?? [],
    scorecard: r.scorecard,
    review: r.reviewed_at
      ? {
          note: r.review_note ?? null,
          score: r.review_score ?? null,
          result: r.review_result ?? null,
          by: r.reviewed_by_name ?? null,
          at: new Date(r.reviewed_at).toISOString(),
        }
      : undefined,
  };
}

// For each person, the required scenarios they've passed at or above the pass score.
// A trainer's corrected score and result count instead of the AI's.
async function passedRequired(userIds: string[], req: Requirements): Promise<Record<string, string[]>> {
  const passed: Record<string, string[]> = {};
  if (!userIds.length || !req.scenarioIds.length) return passed;
  const rows = await db()`
    select user_id, array_agg(distinct scenario_id) as scenario_ids
    from attempts
    where user_id = any(${userIds}::uuid[])
      and scenario_id = any(${req.scenarioIds}::text[])
      and coalesce(review_result, result) = 'pass'
      and coalesce(review_score, overall_score) >= ${req.passScore}
    group by user_id
  `;
  for (const r of rows) passed[r.user_id] = r.scenario_ids;
  return passed;
}

export async function classDashboard(classId: string): Promise<ClassDashboard | null> {
  const cls = await classById(classId);
  if (!cls) return null;

  const [attempts, agents, scenarios, flow] = await Promise.all([
    db()`
      select ${db().unsafe(ATTEMPT_LIST_COLUMNS)}
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
    listScenarios(cls.flowId, true),
    resolveFlow(cls.flowId),
  ]);

  return {
    classInfo: { id: cls.id, name: cls.name, classCode: cls.classCode },
    attempts: attempts.map(toAttempt),
    scenarios,
    flow,
    trainerId: cls.trainerId,
    archived: cls.archived,
    requirements: cls.requirements,
    passed: await passedRequired(
      agents.map((a) => a.id as string),
      cls.requirements,
    ),
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

// Archived classes can't be joined, so their codes stop working.
export async function classByCode(code: string): Promise<ClassInfo | null> {
  const rows = await db()<ClassRow[]>`
    select ${db().unsafe(CLASS_COLUMNS)} from classes
    where class_code = ${normalizeClassCode(code)} and not archived
  `;
  return rows[0] ? toClassInfo(rows[0]) : null;
}

// What an agent in this class sees: the class, its call flow and scenarios, and their progress.
export async function classForAgent(classId: string, userId: string): Promise<JoinResult | null> {
  const cls = await classById(classId);
  if (!cls) return null;
  const [scenarios, flow, passed] = await Promise.all([
    listScenarios(cls.flowId, false),
    resolveFlow(cls.flowId),
    passedRequired([userId], cls.requirements),
  ]);
  return {
    classInfo: { id: cls.id, name: cls.name, classCode: cls.classCode },
    scenarios,
    flow,
    requirements: cls.requirements,
    passed: passed[userId] ?? [],
  };
}

// Moves an agent into the class with this code. Returns null if the code doesn't exist.
export async function joinClass(userId: string, classCode: string): Promise<JoinResult | null> {
  const cls = await classByCode(classCode);
  if (!cls) return null;
  await db()`update users set class_id = ${cls.id} where id = ${userId}`;
  return classForAgent(cls.id, userId);
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

// Moves an agent into another class. Returns false when they aren't an agent.
export async function moveAgent(userId: string, toClassId: string): Promise<boolean> {
  const rows = await db()`update users set class_id = ${toClassId} where id = ${userId} and role = 'agent' returning id`;
  return rows.length > 0;
}

export interface ClassChanges {
  name?: string;
  // null means the built-in sample flow.
  flowId?: string | null;
  trainerId?: string;
  archived?: boolean;
  requirements?: Requirements;
}

export async function updateClass(classId: string, changes: ClassChanges): Promise<boolean> {
  const sql = db();
  const req = changes.requirements;
  const rows = await sql`
    update classes set
      name = ${changes.name ?? sql`name`},
      flow_id = ${changes.flowId === undefined ? sql`flow_id` : changes.flowId},
      trainer_id = ${changes.trainerId ?? sql`trainer_id`},
      archived = ${changes.archived ?? sql`archived`},
      required_scenarios = ${req ? sql.json(req.scenarioIds) : sql`required_scenarios`},
      pass_score = ${req ? req.passScore : sql`pass_score`}
    where id = ${classId}
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
    select ${db().unsafe(ATTEMPT_COLUMNS)}
    from attempts
    where user_id = ${userId}
    order by created_at desc
    limit ${MY_CALLS_LIMIT}
  `;
  return rows.map(toAttempt);
}

// One call with its full conversation, and who it belongs to.
export async function attemptById(
  id: string,
): Promise<{ attempt: SavedAttempt; classId: string | null; userId: string | null } | null> {
  const rows = await db()`select ${db().unsafe(ATTEMPT_COLUMNS)}, class_id from attempts where id = ${id}`;
  return rows[0] ? { attempt: toAttempt(rows[0]), classId: rows[0].class_id ?? null, userId: rows[0].user_id ?? null } : null;
}

const EXPORT_LIMIT = 50_000;

// Every call in a class, for the results download (without conversations).
export async function classCallsForExport(classId: string): Promise<SavedAttempt[]> {
  const rows = await db()`
    select ${db().unsafe(ATTEMPT_LIST_COLUMNS)}
    from attempts
    where class_id = ${classId}
    order by created_at desc
    limit ${EXPORT_LIMIT}
  `;
  return rows.map(toAttempt);
}

// Everything CallCraft stores, for an admin's backup or a data request. Passwords, sessions,
// and one-time links are left out.
export async function exportEverything(): Promise<Record<string, unknown>> {
  const sql = db();
  const [people, classes, flows, scenarios, calls, activity] = await Promise.all([
    sql`select id, name, email, role, class_id, disabled, created_at, last_seen_at from users order by created_at`,
    sql`select id, name, class_code, trainer_id, flow_id, archived, required_scenarios, pass_score, created_at from classes order by created_at`,
    sql`select id, name, company, purpose, end_goal, steps, rules, archived, created_at, updated_at from call_flows order by created_at`,
    sql`select id, flow_id, title, difficulty, focus, lead_name, program, persona, success_criteria, not_applicable, archived, created_at from scenarios order by created_at`,
    sql`select ${sql.unsafe(ATTEMPT_COLUMNS)}, class_id, created_at from attempts order by created_at limit ${EXPORT_LIMIT}`,
    sql`select at, actor_name, action, target from audit_log order by at`,
  ]);
  return { exportedAt: new Date().toISOString(), people, classes, callFlows: flows, scenarios, calls, activity };
}

// The class a call was saved to (null for calls outside a class), or undefined if there's no such call.
export async function attemptClassId(attemptId: string): Promise<string | null | undefined> {
  const rows = await db()`select class_id from attempts where id = ${attemptId}`;
  return rows[0] ? (rows[0].class_id ?? null) : undefined;
}

export interface ReviewInput {
  note: string | null;
  score: number | null;
  result: CallResult | null;
  byName: string;
}

// Saves a trainer's review. Sending an empty review clears it.
export async function saveReview(attemptId: string, review: ReviewInput): Promise<SavedAttempt | null> {
  const empty = !review.note && review.score === null && review.result === null;
  const rows = await db()`
    update attempts set
      review_note = ${review.note},
      review_score = ${review.score},
      review_result = ${review.result},
      reviewed_by_name = ${empty ? null : review.byName},
      reviewed_at = ${empty ? null : db()`now()`}
    where id = ${attemptId}
    returning ${db().unsafe(ATTEMPT_COLUMNS)}
  `;
  return rows[0] ? toAttempt(rows[0]) : null;
}

// Deletes calls older than the retention period. Returns how many were deleted.
export async function purgeOldCalls(days: number): Promise<number> {
  if (!(days > 0)) return 0;
  const rows = await db()`
    delete from attempts where created_at < now() - ${`${days} days`}::interval returning id
  `;
  return rows.length;
}

// ---- Trainer-built scenarios ----
// Scenarios belong to a call flow (null: the built-in sample), so every class on that flow shares them.

export const MAX_SCENARIOS_PER_FLOW = 100;

export class ScenarioLimitError extends Error {
  constructor() {
    super(`A call flow can have up to ${MAX_SCENARIOS_PER_FLOW} scenarios. Hide or edit an existing one instead.`);
  }
}

interface ScenarioRow {
  id: string;
  flow_id: string | null;
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

const SCENARIO_COLUMNS =
  "id, flow_id, title, difficulty, focus, lead_name, program, persona, success_criteria, not_applicable, archived";

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

const onFlow = (flowId: string | null) => (flowId ? db()`flow_id = ${flowId}` : db()`flow_id is null`);

export async function listScenarios(flowId: string | null, includeArchived: boolean): Promise<Scenario[]> {
  const rows = await db()<ScenarioRow[]>`
    select ${db().unsafe(SCENARIO_COLUMNS)}
    from scenarios
    where ${onFlow(flowId)} ${includeArchived ? db()`` : db()`and not archived`}
    order by created_at
  `;
  return rows.map(toScenario);
}

// A trainer-built scenario and the call flow it belongs to. Hidden scenarios still resolve,
// so calls already in progress can finish and be scored.
export async function scenarioWithFlow(id: string): Promise<{ scenario: Scenario; flowId: string | null } | null> {
  const rows = await db()<ScenarioRow[]>`select ${db().unsafe(SCENARIO_COLUMNS)} from scenarios where id = ${id}`;
  return rows[0] ? { scenario: toScenario(rows[0]), flowId: rows[0].flow_id } : null;
}

export async function createScenario(flowId: string | null, input: ScenarioInputValue): Promise<Scenario> {
  const [{ count }] = await db()`select count(*)::int as count from scenarios where ${onFlow(flowId)}`;
  if (count >= MAX_SCENARIOS_PER_FLOW) throw new ScenarioLimitError();
  const rows = await db()<ScenarioRow[]>`
    insert into scenarios (
      flow_id, title, difficulty, focus, lead_name, program, persona, success_criteria, not_applicable
    ) values (
      ${flowId}, ${input.title}, ${input.difficulty}, ${input.focus}, ${input.leadName}, ${input.program},
      ${input.persona}, ${db().json(input.successCriteria)}, ${db().json(input.notApplicable)}
    )
    returning ${db().unsafe(SCENARIO_COLUMNS)}
  `;
  return toScenario(rows[0]);
}

// Returns null when the scenario isn't on that call flow.
export async function updateScenario(
  flowId: string | null,
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
    where id = ${id} and ${onFlow(flowId)}
    returning ${db().unsafe(SCENARIO_COLUMNS)}
  `;
  return rows[0] ? toScenario(rows[0]) : null;
}

export async function setScenarioArchived(flowId: string | null, id: string, archived: boolean): Promise<Scenario | null> {
  const rows = await db()<ScenarioRow[]>`
    update scenarios set archived = ${archived}, updated_at = now()
    where id = ${id} and ${onFlow(flowId)}
    returning ${db().unsafe(SCENARIO_COLUMNS)}
  `;
  return rows[0] ? toScenario(rows[0]) : null;
}
