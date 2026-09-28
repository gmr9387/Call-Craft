import { randomBytes } from "node:crypto";
import { db } from "./db.js";
import { BUILTIN_FLOW, BUILTIN_FLOW_ID, type CallFlow, type FlowInputValue, type FlowSummary } from "../shared/flows.js";
import type { FlowStep } from "../shared/scenarios.js";

// Trainer-built call flows. Every trainer and admin can use and edit them;
// the built-in sample flow is read-only and lives in code.

interface FlowRow {
  id: string;
  name: string;
  company: string;
  purpose: string;
  end_goal: string;
  steps: FlowStep[];
  rules: string[];
  archived: boolean;
}

const COLUMNS = "id, name, company, purpose, end_goal, steps, rules, archived";

function toFlow(r: FlowRow): CallFlow {
  return {
    id: r.id,
    name: r.name,
    company: r.company,
    purpose: r.purpose,
    endGoal: r.end_goal,
    steps: r.steps,
    rules: r.rules,
    archived: r.archived,
  };
}

// Keeps existing step ids (so scenarios that skip a step still match) and gives new steps fresh ones.
function withStepIds(steps: FlowInputValue["steps"]): FlowStep[] {
  const used = new Set<string>();
  return steps.map((s) => {
    let id = s.id && !used.has(s.id) ? s.id : "";
    while (!id || used.has(id)) id = `step_${randomBytes(3).toString("hex")}`;
    used.add(id);
    return { id, label: s.label, guide: s.guide };
  });
}

export async function listFlows(): Promise<FlowSummary[]> {
  const rows = await db()`
    select ${db().unsafe(COLUMNS)},
      (select count(*)::int from classes c where c.flow_id = f.id and not c.archived) as class_count
    from call_flows f
    order by archived, name
  `;
  const [{ count: builtinCount }] = await db()`
    select count(*)::int as count from classes where flow_id is null and not archived
  `;
  return [
    { ...BUILTIN_FLOW, classCount: builtinCount },
    ...rows.map((r) => ({ ...toFlow(r as never), classCount: r.class_count })),
  ];
}

export async function flowById(id: string): Promise<CallFlow | null> {
  if (id === BUILTIN_FLOW_ID) return BUILTIN_FLOW;
  const rows = await db()<FlowRow[]>`select ${db().unsafe(COLUMNS)} from call_flows where id = ${id}`;
  return rows[0] ? toFlow(rows[0]) : null;
}

export async function createFlow(userId: string, input: FlowInputValue): Promise<CallFlow> {
  const rows = await db()<FlowRow[]>`
    insert into call_flows (name, company, purpose, end_goal, steps, rules, created_by)
    values (${input.name}, ${input.company}, ${input.purpose}, ${input.endGoal},
      ${db().json(withStepIds(input.steps) as never)}, ${db().json(input.rules)}, ${userId})
    returning ${db().unsafe(COLUMNS)}
  `;
  return toFlow(rows[0]);
}

export async function updateFlow(id: string, input: FlowInputValue): Promise<CallFlow | null> {
  const rows = await db()<FlowRow[]>`
    update call_flows set
      name = ${input.name},
      company = ${input.company},
      purpose = ${input.purpose},
      end_goal = ${input.endGoal},
      steps = ${db().json(withStepIds(input.steps) as never)},
      rules = ${db().json(input.rules)},
      updated_at = now()
    where id = ${id}
    returning ${db().unsafe(COLUMNS)}
  `;
  return rows[0] ? toFlow(rows[0]) : null;
}

export async function setFlowArchived(id: string, archived: boolean): Promise<CallFlow | null> {
  const rows = await db()<FlowRow[]>`
    update call_flows set archived = ${archived}, updated_at = now()
    where id = ${id}
    returning ${db().unsafe(COLUMNS)}
  `;
  return rows[0] ? toFlow(rows[0]) : null;
}
