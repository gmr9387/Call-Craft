import { requireUser } from "../server/auth.js";
import { myAttempts } from "../server/db.js";
import { errorResponse, json } from "../server/http.js";

// Every practice call the signed-in person has scored, newest first.
export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireUser(request);
    return json({ attempts: await myAttempts(user.id) });
  } catch (error) {
    return errorResponse(error);
  }
}
