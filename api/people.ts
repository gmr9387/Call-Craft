import {
  AuthError,
  canManageClass,
  createInvite,
  createResetLink,
  listPeople,
  requireUser,
  setDisabled,
  userById,
} from "../server/auth.js";
import { cleanId, errorResponse, json, readJson } from "../server/http.js";

const NOT_FOUND = "That person wasn't found.";

// People endpoint:
// - "list" (admins): every account
// - "invite" (admins): a one-time link for a new trainer or admin to create their account
// - "reset-link" (admins; trainers for agents in their classes): a one-time link to set a new password
// - "disable" (admins): turn an account off or back on
// Links are returned as tokens; the browser turns them into full links to copy.
export async function POST(request: Request): Promise<Response> {
  const body = await readJson(request);
  if (!body) return json({ error: "Invalid JSON body." }, 400);

  try {
    switch (body.action) {
      case "list": {
        await requireUser(request, "admin");
        return json({ people: await listPeople() });
      }
      case "invite": {
        const admin = await requireUser(request, "admin");
        const role = body.role === "admin" ? "admin" : body.role === "trainer" ? "trainer" : null;
        if (!role) return json({ error: "Choose trainer or admin." }, 400);
        return json({ token: await createInvite(admin.id, role) });
      }
      case "reset-link": {
        const user = await requireUser(request, "admin", "trainer");
        const targetId = cleanId(body.userId);
        const target = targetId ? await userById(targetId) : null;
        if (!target) return json({ error: NOT_FOUND }, 404);
        // Trainers can reset only agents in a class they run.
        const allowed =
          user.role === "admin" ||
          (target.role === "agent" && !!target.classId && (await canManageClass(user, target.classId)));
        if (!allowed) throw new AuthError("You can only reset passwords for agents in your classes.", 403);
        return json({ token: await createResetLink(user.id, target.id) });
      }
      case "disable": {
        const admin = await requireUser(request, "admin");
        const id = cleanId(body.userId);
        if (!id) return json({ error: NOT_FOUND }, 404);
        if (id === admin.id) return json({ error: "You can't turn off your own account." }, 400);
        return (await setDisabled(id, body.disabled === true)) ? json({ ok: true }) : json({ error: NOT_FOUND }, 404);
      }
      default:
        return json({ error: "Unknown action." }, 400);
    }
  } catch (error) {
    return errorResponse(error);
  }
}
