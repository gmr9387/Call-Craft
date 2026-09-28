import { classDashboard, createClass, findClass } from "../server/db.js";
import { cleanText, errorResponse, json, readJson } from "../server/http.js";

// Class endpoint:
// - "create": a trainer creates a class and gets its class code plus a private trainer key.
// - "join": an agent checks a class code before practicing.
// - "dashboard": a trainer loads every scored call in their class with the trainer key.
export async function POST(request: Request): Promise<Response> {
  const body = await readJson(request);
  if (!body) return json({ error: "Invalid JSON body." }, 400);

  try {
    switch (body.action) {
      case "create": {
        const name = cleanText(body.name, 120);
        if (!name) return json({ error: "Give the class a name (up to 120 characters)." }, 400);
        const { classInfo, trainerKey } = await createClass(name);
        return json({ classInfo, trainerKey });
      }
      case "join": {
        const code = cleanText(body.classCode, 20);
        const classInfo = code ? await findClass(code) : null;
        if (!classInfo) return json({ error: "That class code wasn't found. Check it with your trainer." }, 404);
        return json({ classInfo });
      }
      case "dashboard": {
        const key = cleanText(body.trainerKey, 100);
        const dashboard = key ? await classDashboard(key) : null;
        if (!dashboard) return json({ error: "That trainer key wasn't recognized." }, 404);
        return json(dashboard);
      }
      default:
        return json({ error: "Unknown action." }, 400);
    }
  } catch (error) {
    return errorResponse(error);
  }
}
