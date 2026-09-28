import { canManageClass, requireUser } from "../server/auth.js";
import { draftScenario } from "../server/coach.js";
import { classById, createScenario, setScenarioArchived, updateScenario } from "../server/db.js";
import { flowForClass } from "../server/flows.js";
import { checkUsage } from "../server/limits.js";
import { cleanId, cleanText, errorResponse, json, readJson } from "../server/http.js";
import { ScenarioInput } from "../shared/scenarioInput.js";
import { isCustomScenarioId } from "../shared/scenarios.js";

const NOT_FOUND = "That class or scenario wasn't found.";

// Scenario builder endpoint, for the trainers and admins who manage the class.
// - "draft": turn a one-line description into a full scenario draft (not saved).
// - "create" / "update": save a scenario to the class.
// - "archive": hide or restore a scenario for agents.
export async function POST(request: Request): Promise<Response> {
  const body = await readJson(request);
  if (!body) return json({ error: "Invalid JSON body." }, 400);

  try {
    const user = await requireUser(request, "admin", "trainer");
    const classId = cleanId(body.classId);
    if (!classId || !(await canManageClass(user, classId))) return json({ error: NOT_FOUND }, 404);

    switch (body.action) {
      case "draft": {
        const description = cleanText(body.description, 1000);
        if (!description) return json({ error: "Describe the scenario in a sentence or two." }, 400);
        const cls = await classById(classId);
        if (!cls) return json({ error: NOT_FOUND }, 404);
        await checkUsage("draft", request, cls.classCode, user.id);
        return json({ draft: await draftScenario(description, await flowForClass(classId)) });
      }
      case "create":
      case "update": {
        const parsed = ScenarioInput.safeParse(body.scenario);
        if (!parsed.success) {
          return json({ error: parsed.error.issues[0]?.message ?? "Check the scenario fields." }, 400);
        }
        // Skipped steps must be steps of this class's call flow.
        const flow = await flowForClass(classId);
        const stepIds = new Set(flow.steps.map((s) => s.id));
        const input = { ...parsed.data, notApplicable: [...new Set(parsed.data.notApplicable)].filter((id) => stepIds.has(id)) };
        if (body.action === "create") {
          return json({ scenario: await createScenario(classId, input) });
        }
        const id = typeof body.id === "string" && isCustomScenarioId(body.id) ? body.id : null;
        const scenario = id ? await updateScenario(classId, id, input) : null;
        return scenario ? json({ scenario }) : json({ error: NOT_FOUND }, 404);
      }
      case "archive": {
        const id = typeof body.id === "string" && isCustomScenarioId(body.id) ? body.id : null;
        const scenario = id ? await setScenarioArchived(classId, id, body.archived === true) : null;
        return scenario ? json({ scenario }) : json({ error: NOT_FOUND }, 404);
      }
      default:
        return json({ error: "Unknown action." }, 400);
    }
  } catch (error) {
    return errorResponse(error);
  }
}
