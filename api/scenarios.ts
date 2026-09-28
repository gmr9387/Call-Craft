import { draftScenario } from "../server/coach.js";
import { createScenario, isTrainerKeyValid, setScenarioArchived, updateScenario } from "../server/db.js";
import { cleanText, errorResponse, json, readJson } from "../server/http.js";
import { ScenarioInput } from "../shared/scenarioInput.js";
import { isCustomScenarioId } from "../shared/scenarios.js";

const NOT_FOUND = "That trainer key or scenario wasn't found.";

// Scenario builder endpoint. Every action needs the class's trainer key.
// - "draft": turn a one-line description into a full scenario draft (not saved).
// - "create" / "update": save a scenario to the trainer's class.
// - "archive": hide or restore a scenario for agents.
export async function POST(request: Request): Promise<Response> {
  const body = await readJson(request);
  if (!body) return json({ error: "Invalid JSON body." }, 400);

  const trainerKey = cleanText(body.trainerKey, 100);
  if (!trainerKey) return json({ error: "A trainer key is required." }, 401);

  try {
    switch (body.action) {
      case "draft": {
        const description = cleanText(body.description, 1000);
        if (!description) return json({ error: "Describe the scenario in a sentence or two." }, 400);
        // Checked first so the AI can't be used without a real trainer key.
        if (!(await isTrainerKeyValid(trainerKey))) return json({ error: NOT_FOUND }, 404);
        return json({ draft: await draftScenario(description) });
      }
      case "create":
      case "update": {
        const parsed = ScenarioInput.safeParse(body.scenario);
        if (!parsed.success) {
          return json({ error: parsed.error.issues[0]?.message ?? "Check the scenario fields." }, 400);
        }
        const input = { ...parsed.data, notApplicable: [...new Set(parsed.data.notApplicable)] };
        if (body.action === "create") {
          const scenario = await createScenario(trainerKey, input);
          return scenario ? json({ scenario }) : json({ error: NOT_FOUND }, 404);
        }
        const id = typeof body.id === "string" && isCustomScenarioId(body.id) ? body.id : null;
        const scenario = id ? await updateScenario(trainerKey, id, input) : null;
        return scenario ? json({ scenario }) : json({ error: NOT_FOUND }, 404);
      }
      case "archive": {
        const id = typeof body.id === "string" && isCustomScenarioId(body.id) ? body.id : null;
        const scenario = id ? await setScenarioArchived(trainerKey, id, body.archived === true) : null;
        return scenario ? json({ scenario }) : json({ error: NOT_FOUND }, 404);
      }
      default:
        return json({ error: "Unknown action." }, 400);
    }
  } catch (error) {
    return errorResponse(error);
  }
}
