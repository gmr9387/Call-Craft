import { AuthError, canManageClass, requireUser, userById, type User } from "../server/auth.js";
import {
  classById,
  classDashboard,
  classForAgent,
  createClass,
  joinClass,
  listClasses,
  moveAgent,
  removeAgentFromClass,
  updateClass,
  type ClassChanges,
} from "../server/db.js";
import { flowById } from "../server/flows.js";
import { cleanId, cleanText, errorResponse, json, readJson } from "../server/http.js";
import { BUILTIN_FLOW_ID } from "../shared/flows.js";

const NOT_FOUND = "That class wasn't found.";
const NO_ACCESS = "You don't have access to that.";

// The class id from the body, if the signed-in trainer or admin can manage it.
async function managedClassId(user: User, value: unknown): Promise<string | null> {
  const id = cleanId(value);
  if (!id) return null;
  return (await canManageClass(user, id)) ? id : null;
}

// A call flow choice from the browser: null for the built-in sample, or an active flow's id.
async function flowChoice(value: unknown): Promise<string | null> {
  if (value === undefined || value === null || value === BUILTIN_FLOW_ID) return null;
  const id = cleanId(value);
  const flow = id ? await flowById(id) : null;
  if (!flow || flow.archived) throw new ClassInputError("That call flow wasn't found.");
  return flow.id;
}

class ClassInputError extends Error {}

// Class endpoint:
// - "list" (trainers and admins): the classes you run (admins: every class)
// - "create" (trainers and admins): a new class, using a call flow, with a code agents sign up with
// - "dashboard" (trainers and admins): every call, scenario, and agent in one class
// - "update" (trainers and admins): rename, change the call flow, archive or restore
// - "reassign" (admins): hand a class to another trainer
// - "remove-agent" / "move-agent" (trainers and admins): take an agent out, or move them to another class
// - "mine" (agents): your class, its call flow, and its trainer-built scenarios
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
        return json({ classInfo: await createClass(user.id, name, await flowChoice(body.flowId)) });
      }
      case "dashboard": {
        const id = await managedClassId(user, body.classId);
        const dashboard = id ? await classDashboard(id) : null;
        return dashboard ? json(dashboard) : json({ error: NOT_FOUND }, 404);
      }
      case "update": {
        const id = await managedClassId(user, body.classId);
        if (!id) return json({ error: NOT_FOUND }, 404);
        const changes: ClassChanges = {};
        if (body.name !== undefined) {
          const name = cleanText(body.name, 120);
          if (!name) return json({ error: "Give the class a name (up to 120 characters)." }, 400);
          changes.name = name;
        }
        if (body.flowId !== undefined) changes.flowId = await flowChoice(body.flowId);
        if (body.archived !== undefined) changes.archived = body.archived === true;
        await updateClass(id, changes);
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
        return json({ ok: true });
      }
      case "remove-agent": {
        const id = await managedClassId(user, body.classId);
        const agentId = cleanId(body.userId);
        const removed = id && agentId ? await removeAgentFromClass(id, agentId) : false;
        return removed ? json({ ok: true }) : json({ error: "That agent isn't in this class." }, 404);
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
        return json({ ok: true });
      }
      case "mine": {
        return json({ joined: user.classId ? await classForAgent(user.classId) : null });
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
