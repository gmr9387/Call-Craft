import {
  AccountInputError,
  acceptInvite,
  changePassword,
  checkLogin,
  cleanEmail,
  cleanName,
  cleanPassword,
  clearSessionCookie,
  createAgent,
  createFirstAdmin,
  currentUser,
  endSession,
  linkInfo,
  needsSetup,
  requireUser,
  resetPassword,
  startSession,
  toMe,
  type User,
} from "../server/auth.js";
import { logActivity } from "../server/audit.js";
import { classByCode, isDbConfigured } from "../server/db.js";
import { cleanText, errorResponse, json, readJson } from "../server/http.js";
import { checkSigninAllowed, recordSigninFailure } from "../server/limits.js";
import { recentAiProblem } from "../server/settings.js";

// Signs the person in and returns who they are.
async function signedIn(request: Request, user: User): Promise<Response> {
  return json({ user: await toMe(user) }, 200, { "set-cookie": await startSession(request, user.id) });
}

function token(body: Record<string, unknown>): string {
  const value = cleanText(body.token, 200);
  if (!value) throw new AccountInputError("This link is incomplete. Copy the whole link and try again.");
  return value;
}

// Who is signed in, and whether this deployment still needs its first admin.
export async function GET(request: Request): Promise<Response> {
  try {
    if (!isDbConfigured()) {
      return json({ error: "Accounts need a database: set DATABASE_URL on the server." }, 503);
    }
    const user = await currentUser(request);
    // Trainers and admins see a warning when the AI stopped working in the last hour.
    const aiProblem = user && user.role !== "agent" ? await recentAiProblem() : null;
    return json({
      user: user ? await toMe(user) : null,
      needsSetup: user ? false : await needsSetup(),
      aiProblem: aiProblem?.message ?? null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

// Account endpoint:
// - "login" / "logout"
// - "setup": create the first admin account (only while no accounts exist)
// - "signup": an agent creates an account with their class code
// - "link": what a one-time invite or reset link is for
// - "accept": create a trainer or admin account from an invite link
// - "reset": set a new password from a reset link
// - "password": change your own password
export async function POST(request: Request): Promise<Response> {
  const body = await readJson(request);
  if (!body) return json({ error: "Invalid JSON body." }, 400);

  try {
    switch (body.action) {
      case "login": {
        await checkSigninAllowed(request);
        const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        const password = typeof body.password === "string" ? body.password : "";
        const user = email && password ? await checkLogin(email, password) : null;
        if (!user) {
          await recordSigninFailure(request);
          return json({ error: "That email and password don't match. Check them and try again." }, 401);
        }
        return signedIn(request, user);
      }
      case "logout": {
        await endSession(request);
        return json({ ok: true }, 200, { "set-cookie": clearSessionCookie(request) });
      }
      case "setup": {
        const fields = { name: cleanName(body.name), email: cleanEmail(body.email), password: cleanPassword(body.password) };
        const user = await createFirstAdmin(fields);
        if (!user) return json({ error: "CallCraft is already set up. Sign in instead." }, 409);
        await logActivity(user, "Set up CallCraft", `first admin: ${user.email}`);
        return signedIn(request, user);
      }
      case "signup": {
        await checkSigninAllowed(request);
        const code = cleanText(body.classCode, 20);
        const cls = code ? await classByCode(code) : null;
        if (!cls) {
          await recordSigninFailure(request);
          return json({ error: "That class code wasn't found. Check it with your trainer." }, 404);
        }
        const fields = { name: cleanName(body.name), email: cleanEmail(body.email), password: cleanPassword(body.password) };
        const agent = await createAgent({ ...fields, classId: cls.id });
        await logActivity(agent, "Signed up", `agent in ${cls.name}`);
        return signedIn(request, agent);
      }
      case "link": {
        await checkSigninAllowed(request);
        const info = await linkInfo(token(body));
        if (!info) {
          await recordSigninFailure(request);
          return json({ error: "This link has expired or was already used. Ask for a new one." }, 404);
        }
        return json({ link: info });
      }
      case "accept": {
        const fields = { name: cleanName(body.name), email: cleanEmail(body.email), password: cleanPassword(body.password) };
        const invited = await acceptInvite(token(body), fields);
        await logActivity(invited, "Accepted invite", `${invited.role}: ${invited.email}`);
        return signedIn(request, invited);
      }
      case "reset": {
        const person = await resetPassword(token(body), cleanPassword(body.password));
        await logActivity(person, "Set a new password", "with a reset link");
        return signedIn(request, person);
      }
      case "password": {
        const user = await requireUser(request);
        const next = cleanPassword(body.newPassword);
        const ok = await changePassword(user.id, typeof body.currentPassword === "string" ? body.currentPassword : "", next);
        if (!ok) return json({ error: "Your current password isn't right." }, 400);
        return json({ ok: true });
      }
      default:
        return json({ error: "Unknown action." }, 400);
    }
  } catch (error) {
    return errorResponse(error);
  }
}
