import { AuthError, canManageClass, requireUser, userById, type User } from "../server/auth.js";
import { logActivity } from "../server/audit.js";
import {
  attemptById,
  attemptClassId,
  classCallsForExport,
  classById,
  classDashboard,
  classForAgent,
  createClass,
  joinClass,
  listClasses,
  listScenarios,
  moveAgent,
  removeAgentFromClass,
  saveReview,
  updateClass,
  type ClassChanges,
} from "../server/db.js";
import { flowById } from "../server/flows.js";
import { cleanId, cleanText, errorResponse, json, readJson } from "../server/http.js";
import type { CallResult } from "../shared/classes.js";
import { BUILTIN_FLOW_ID } from "../shared/flows.js";
import { SCENARIOS } from "../shared/scenarios.js";

const NOT_FOUND = "That class wasn't found.";
const NO_ACCESS = "You don't have access to that.";
const MAX_REQUIRED = 20;

class ClassInputError extends Error {}

// The class id from the body, if the signed-in trainer or admin can manage it.
async function managedClassId(user: User, value: unknown): Promise<string | null> {
  const id = cleanId(value);
  if (!id) return null;
  return (await canManageClass(user, id)) ? id : null;
}

// A call flow choice from the browser: null for the built-in sample, or an active flow's id.
async function flowChoice(value: unknown): Promise<{ id: string | null; name: string }> {
  if (value === undefined || value === null || value === BUILTIN_FLOW_ID) return { id: null, name: "the sample flow" };
  const id = cleanId(value);
  const flow = id ? await flowById(id) : null;
  if (!flow || flow.archived) throw new ClassInputError("That call flow wasn't found.");
  return { id: flow.id, name: flow.name };
}

// Required scenarios must be scenarios agents in this class can practice.
async function requirementsFor(
  classId: string,
  scenarioIds: unknown,
  passScore: unknown,
): Promise<ClassChanges["requirements"]> {
  const cls = await classById(classId);
  if (!cls) throw new ClassInputError(NOT_FOUND);
  const score = Number(passScore);
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    throw new ClassInputError("The passing score must be a whole number from 0 to 100.");
  }
  if (!Array.isArray(scenarioIds) || scenarioIds.length > MAX_REQUIRED) {
    throw new ClassInputError(`Pick up to ${MAX_REQUIRED} required scenarios.`);
  }
  const available = new Set((await listScenarios(cls.flowId, true)).map((s) => s.id));
  if (!cls.flowId) for (const s of SCENARIOS) available.add(s.id);
  const ids = [...new Set(scenarioIds.filter((id): id is string => typeof id === "string"))];
  if (ids.some((id) => !available.has(id))) throw new ClassInputError("One of those scenarios isn't on this class's call flow.");
  return { scenarioIds: ids, passScore: score };
}

const RESULTS: CallResult[] = ["pass", "needs_work", "fail"];

// Class endpoint:
// - "list" (trainers and admins): the classes you run (admins: every class)
// - "create" (trainers and admins): a new class, using a call flow, with a code agents sign up with
// - "dashboard" (trainers and admins): every call, scenario, agent, and who is ready, for one class
// - "update" (trainers and admins): rename, change the call flow or the ready-for-live-calls
//   requirements, archive or restore
// - "reassign" (admins): hand a class to another trainer
// - "remove-agent" / "move-agent" (trainers and admins): take an agent out, or move them to another class
// - "review" (trainers and admins): a note on a call, and optionally a corrected score and result
// - "call": one call with its full conversation (your own, or one in a class you manage)
// - "export" (trainers and admins): every call in a class, for the results download
// - "mine" (agents): your class, its call flow and scenarios, and your progress
// - "join" (agents): move to another class with its code
export async function POST(request: Request): Promise<Response> {
  const body = await readJson(request);
  if (!body) return json({ error: "Invalid JSON body." }, 400);

  try {
    const user = await requireUser(request);
    const isStaff = user.role === "admin" || user.role === "trainer";

    switch (body.action) {
      case "list": {
        if (!isStaff) throw new AuthError(NO_ACCESS, 403);
        return json({ classes: await listClasses(user.role === "admin" ? null : user.id) });
      }
      case "create": {
        if (!isStaff) throw new AuthError(NO_ACCESS, 403);
        const name = cleanText(body.name, 120);
        if (!name) return json({ error: "Give the class a name (up to 120 characters)." }, 400);
        const flow = await flowChoice(body.flowId);
        const classInfo = await createClass(user.id, name, flow.id);
        await logActivity(user, "Created class", `${name} (${flow.name})`);
        return json({ classInfo });
      }
      case "dashboard": {
        const id = await managedClassId(user, body.classId);
        const dashboard = id ? await classDashboard(id) : null;
        return dashboard ? json(dashboard) : json({ error: NOT_FOUND }, 404);
      }
      case "update": {
        const id = await managedClassId(user, body.classId);
        const cls = id ? await classById(id) : null;
        if (!id || !cls) return json({ error: NOT_FOUND }, 404);
        const changes: ClassChanges = {};
        const done: string[] = [];
        if (body.name !== undefined) {
          const name = cleanText(body.name, 120);
          if (!name) return json({ error: "Give the class a name (up to 120 characters)." }, 400);
          changes.name = name;
          done.push(`renamed to ${name}`);
        }
        if (body.flowId !== undefined) {
          const flow = await flowChoice(body.flowId);
          changes.flowId = flow.id;
          // Required scenarios belong to the old flow, so they're cleared with it.
          if (flow.id !== cls.flowId) changes.requirements = { scenarioIds: [], passScore: cls.requirements.passScore };
          done.push(`call flow set to ${flow.name}`);
        }
        if (body.requiredScenarios !== undefined) {
          changes.requirements = await requirementsFor(id, body.requiredScenarios, body.passScore);
          done.push(`ready-for-live-calls: ${changes.requirements!.scenarioIds.length} scenarios at ${changes.requirements!.passScore}+`);
        }
        if (body.archived !== undefined) {
          changes.archived = body.archived === true;
          done.push(changes.archived ? "archived" : "brought back");
        }
        await updateClass(id, changes);
        if (done.length) await logActivity(user, "Changed class", `${cls.name}: ${done.join(", ")}`);
        return json({ ok: true });
      }
      case "reassign": {
        if (user.role !== "admin") throw new AuthError(NO_ACCESS, 403);
        const id = cleanId(body.classId);
        const trainerId = cleanId(body.trainerId);
        const trainer = trainerId ? await userById(trainerId) : null;
        if (!trainer || trainer.role === "agent") return json({ error: "Pick a trainer or admin." }, 400);
        const cls = id ? await classById(id) : null;
        if (!cls) return json({ error: NOT_FOUND }, 404);
        await updateClass(cls.id, { trainerId: trainer.id });
        await logActivity(user, "Handed over class", `${cls.name} to ${trainer.name}`);
        return json({ ok: true });
      }
      case "remove-agent": {
        const id = await managedClassId(user, body.classId);
        const agentId = cleanId(body.userId);
        const agent = agentId ? await userById(agentId) : null;
        const removed = id && agent ? await removeAgentFromClass(id, agent.id) : false;
        if (!removed) return json({ error: "That agent isn't in this class." }, 404);
        await logActivity(user, "Removed agent from class", `${agent!.name} (${(await classById(id!))?.name ?? "class"})`);
        return json({ ok: true });
      }
      case "move-agent": {
        // Trainers can move agents between classes they run; admins between any classes.
        const from = await managedClassId(user, body.classId);
        const to = await managedClassId(user, body.toClassId);
        const agentId = cleanId(body.userId);
        const agent = agentId ? await userById(agentId) : null;
        if (!from || !to || !agent || agent.classId !== from) {
          return json({ error: "That agent or class wasn't found." }, 404);
        }
        const target = await classById(to);
        if (!target || target.archived) return json({ error: "Pick a class that isn't archived." }, 400);
        await moveAgent(agent.id, to);
        await logActivity(user, "Moved agent", `${agent.name} to ${target.name}`);
        return json({ ok: true });
      }
      case "review": {
        if (!isStaff) throw new AuthError(NO_ACCESS, 403);
        const attemptId = cleanId(body.attemptId);
        const classId = attemptId ? await attemptClassId(attemptId) : undefined;
        if (classId === undefined) return json({ error: "That call wasn't found." }, 404);
        // Calls outside a class (a trainer's own practice) can only be reviewed by admins.
        const allowed = classId ? await canManageClass(user, classId) : user.role === "admin";
        if (!allowed) return json({ error: "That call wasn't found." }, 404);

        const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 2000) : null;
        const score = body.score === null || body.score === undefined || body.score === "" ? null : Number(body.score);
        if (score !== null && (!Number.isInteger(score) || score < 0 || score > 100)) {
          return json({ error: "The corrected score must be a whole number from 0 to 100." }, 400);
        }
        const result = RESULTS.includes(body.result as CallResult) ? (body.result as CallResult) : null;
        const attempt = await saveReview(attemptId!, { note, score, result, byName: user.name });
        if (!attempt) return json({ error: "That call wasn't found." }, 404);
        await logActivity(
          user,
          "Reviewed call",
          `${attempt.agentName}, ${attempt.scenarioTitle ?? attempt.scenarioId}${score !== null ? ` (score ${score})` : ""}`,
        );
        return json({ attempt });
      }
      case "call": {
        const id = cleanId(body.attemptId);
        const found = id ? await attemptById(id) : null;
        const allowed =
          !!found &&
          (found.userId === user.id ||
            (found.classId ? await canManageClass(user, found.classId) : user.role === "admin"));
        return allowed ? json({ attempt: found!.attempt }) : json({ error: "That call wasn't found." }, 404);
      }
      case "export": {
        const id = await managedClassId(user, body.classId);
        const cls = id ? await classById(id) : null;
        if (!id || !cls) return json({ error: NOT_FOUND }, 404);
        await logActivity(user, "Downloaded class results", cls.name);
        return json({ attempts: await classCallsForExport(id) });
      }
      case "mine": {
        return json({ joined: user.classId ? await classForAgent(user.classId, user.id) : null });
      }
      case "join": {
        if (user.role !== "agent") throw new AuthError("Only agents join classes.", 403);
        const code = cleanText(body.classCode, 20);
        const joined = code ? await joinClass(user.id, code) : null;
        if (!joined) return json({ error: "That class code wasn't found. Check it with your trainer." }, 404);
        return json(joined);
      }
      default:
        return json({ error: "Unknown action." }, 400);
    }
  } catch (error) {
    if (error instanceof ClassInputError) return json({ error: error.message }, 400);
    return errorResponse(error);
  }
}
