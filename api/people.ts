import {
  AuthError,
  canManageClass,
  cleanEmail,
  cleanName,
  deletePerson,
  setRole,
  updatePerson,
  createInvite,
  createResetLink,
  listPeople,
  requireUser,
  setDisabled,
  userById,
} from "../server/auth.js";
import { logActivity } from "../server/audit.js";
import { cleanId, errorResponse, json, readJson } from "../server/http.js";

const NOT_FOUND = "That person wasn't found.";

// People endpoint:
// - "list" (admins): every account
// - "invite" (admins): a one-time link for a new trainer or admin to create their account
// - "reset-link" (admins; trainers for agents in their classes): a one-time link to set a new password
// - "update" (admins; trainers for agents in their classes): fix someone's name or email
// - "disable" (admins): turn an account off or back on
// - "delete" (admins): delete an account and every practice call it made (for data requests)
// - "role" (admins): make someone an admin, trainer, or agent
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
        const token = await createInvite(admin.id, role);
        await logActivity(admin, "Made invite link", `new ${role}`);
        return json({ token });
      }
      case "reset-link":
      case "update": {
        const user = await requireUser(request, "admin", "trainer");
        const targetId = cleanId(body.userId);
        const target = targetId ? await userById(targetId) : null;
        if (!target) return json({ error: NOT_FOUND }, 404);
        // Trainers can help only agents in a class they run.
        const allowed =
          user.role === "admin" ||
          (target.role === "agent" && !!target.classId && (await canManageClass(user, target.classId)));
        if (!allowed) throw new AuthError("You can only change agents in your classes.", 403);
        if (body.action === "reset-link") {
          const token = await createResetLink(user.id, target.id);
          await logActivity(user, "Made password reset link", `${target.name} (${target.email})`);
          return json({ token });
        }
        const fields = { name: cleanName(body.name), email: cleanEmail(body.email) };
        await updatePerson(target.id, fields);
        await logActivity(user, "Edited person", `${target.name} (${target.email}) → ${fields.name} (${fields.email})`);
        return json({ ok: true });
      }
      case "disable": {
        const admin = await requireUser(request, "admin");
        const id = cleanId(body.userId);
        if (!id) return json({ error: NOT_FOUND }, 404);
        if (id === admin.id) return json({ error: "You can't turn off your own account." }, 400);
        const target = await userById(id);
        if (!target || !(await setDisabled(id, body.disabled === true))) return json({ error: NOT_FOUND }, 404);
        await logActivity(admin, body.disabled === true ? "Turned off account" : "Turned on account", `${target.name} (${target.email})`);
        return json({ ok: true });
      }
      case "role": {
        const admin = await requireUser(request, "admin");
        const id = cleanId(body.userId);
        const target = id ? await userById(id) : null;
        if (!target) return json({ error: NOT_FOUND }, 404);
        if (target.id === admin.id) return json({ error: "You can't change your own role. Ask another admin." }, 400);
        const role = body.role === "admin" || body.role === "trainer" || body.role === "agent" ? body.role : null;
        if (!role) return json({ error: "Choose admin, trainer, or agent." }, 400);
        if (role === target.role) return json({ ok: true });
        await setRole(target.id, role);
        await logActivity(admin, "Changed role", `${target.name} (${target.email}): ${target.role} → ${role}`);
        return json({ ok: true });
      }
      case "delete": {
        const admin = await requireUser(request, "admin");
        const id = cleanId(body.userId);
        const target = id ? await userById(id) : null;
        if (!target) return json({ error: NOT_FOUND }, 404);
        if (target.id === admin.id) return json({ error: "You can't delete your own account." }, 400);
        // The admin types the person's email to confirm, so a slip of the mouse can't delete anyone.
        const confirm = typeof body.confirmEmail === "string" ? body.confirmEmail.trim().toLowerCase() : "";
        if (confirm !== target.email) return json({ error: "Type the person's email exactly to confirm." }, 400);
        const calls = await deletePerson(target.id);
        await logActivity(admin, "Deleted person and their data", `${target.name} (${target.email}), ${calls} calls`);
        return json({ ok: true, calls });
      }
      default:
        return json({ error: "Unknown action." }, 400);
    }
  } catch (error) {
    return errorResponse(error);
  }
}
