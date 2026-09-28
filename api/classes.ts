import { AuthError, canManageClass, requireUser, type User } from "../server/auth.js";
import {
  classDashboard,
  classForAgent,
  createClass,
  joinClass,
  listClasses,
  removeAgentFromClass,
} from "../server/db.js";
import { cleanId, cleanText, errorResponse, json, readJson } from "../server/http.js";

const NOT_FOUND = "That class wasn't found.";

// The class id from the body, if the signed-in trainer or admin can manage it.
async function managedClassId(user: User, body: Record<string, unknown>): Promise<string | null> {
  const id = cleanId(body.classId);
  if (!id) return null;
  return (await canManageClass(user, id)) ? id : null;
}

// Class endpoint:
// - "list" (trainers and admins): the classes you run (admins: every class)
// - "create" (trainers and admins): a new class with a code agents use to sign up
// - "dashboard" (trainers and admins): every call, scenario, and agent in one class
// - "remove-agent" (trainers and admins): take an agent out of a class
// - "mine" (agents): your class and its trainer-built scenarios
// - "join" (agents): move to another class with its code
export async function POST(request: Request): Promise<Response> {
  const body = await readJson(request);
  if (!body) return json({ error: "Invalid JSON body." }, 400);

  try {
    const user = await requireUser(request);
    const isStaff = user.role === "admin" || user.role === "trainer";

    switch (body.action) {
      case "list": {
        if (!isStaff) throw new AuthError("You don't have access to that.", 403);
        return json({ classes: await listClasses(user.role === "admin" ? null : user.id) });
      }
      case "create": {
        if (!isStaff) throw new AuthError("You don't have access to that.", 403);
        const name = cleanText(body.name, 120);
        if (!name) return json({ error: "Give the class a name (up to 120 characters)." }, 400);
        return json({ classInfo: await createClass(user.id, name) });
      }
      case "dashboard": {
        const id = await managedClassId(user, body);
        const dashboard = id ? await classDashboard(id) : null;
        return dashboard ? json(dashboard) : json({ error: NOT_FOUND }, 404);
      }
      case "remove-agent": {
        const id = await managedClassId(user, body);
        const agentId = cleanId(body.userId);
        const removed = id && agentId ? await removeAgentFromClass(id, agentId) : false;
        return removed ? json({ ok: true }) : json({ error: "That agent isn't in this class." }, 404);
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
    return errorResponse(error);
  }
}
