import { requireUser } from "../server/auth.js";
import { logActivity } from "../server/audit.js";
import { draftScenario } from "../server/coach.js";
import { createScenario, resolveFlow, setScenarioArchived, updateScenario } from "../server/db.js";
import { flowById } from "../server/flows.js";
import { checkUsage } from "../server/limits.js";
import { cleanId, cleanText, errorResponse, json, readJson } from "../server/http.js";
import { ScenarioInput } from "../shared/scenarioInput.js";
import { isCustomScenarioId } from "../shared/scenarios.js";
import { BUILTIN_FLOW_ID } from "../shared/flows.js";

const NOT_FOUND = "That call flow or scenario wasn't found.";

// The call flow from the body: null for the built-in sample, the flow's id, or undefined if it doesn't exist.
async function flowChoice(value: unknown): Promise<string | null | undefined> {
  if (value === BUILTIN_FLOW_ID) return null;
  const id = cleanId(value);
  return id && (await flowById(id)) ? id : undefined;
}

// Scenario builder endpoint, for trainers and admins. Scenarios belong to a call flow, so every
// class on that flow shares them.
// - "draft": turn a one-line description into a full scenario draft (not saved).
// - "create" / "update": save a scenario to the call flow.
// - "archive": hide or restore a scenario for agents.
export async function POST(request: Request): Promise<Response> {
  const body = await readJson(request);
  if (!body) return json({ error: "Invalid JSON body." }, 400);

  try {
    const user = await requireUser(request, "admin", "trainer");
    const flowId = await flowChoice(body.flowId);
    if (flowId === undefined) return json({ error: NOT_FOUND }, 404);
    const flow = await resolveFlow(flowId);

    switch (body.action) {
      case "draft": {
        const description = cleanText(body.description, 1000);
        if (!description) return json({ error: "Describe the scenario in a sentence or two." }, 400);
        await checkUsage("draft", request, `flow:${flow.id}`, user.id);
        return json({ draft: await draftScenario(description, flow) });
      }
      case "create":
      case "update": {
        const parsed = ScenarioInput.safeParse(body.scenario);
        if (!parsed.success) {
          return json({ error: parsed.error.issues[0]?.message ?? "Check the scenario fields." }, 400);
        }
        // Skipped steps must be steps of this call flow.
        const stepIds = new Set(flow.steps.map((s) => s.id));
        const input = {
          ...parsed.data,
          notApplicable: [...new Set(parsed.data.notApplicable)].filter((id) => stepIds.has(id)),
        };
        if (body.action === "create") {
          const scenario = await createScenario(flowId, input);
          await logActivity(user, "Created scenario", `${scenario.title} (${flow.name})`);
          return json({ scenario });
        }
        const id = typeof body.id === "string" && isCustomScenarioId(body.id) ? body.id : null;
        const expected =
          typeof body.updatedAt === "string" && !Number.isNaN(Date.parse(body.updatedAt)) ? body.updatedAt : undefined;
        const scenario = id ? await updateScenario(flowId, id, input, expected) : null;
        if (!scenario) return json({ error: NOT_FOUND }, 404);
        await logActivity(user, "Edited scenario", `${scenario.title} (${flow.name})`);
        return json({ scenario });
      }
      case "archive": {
        const id = typeof body.id === "string" && isCustomScenarioId(body.id) ? body.id : null;
        const scenario = id ? await setScenarioArchived(flowId, id, body.archived === true) : null;
        if (!scenario) return json({ error: NOT_FOUND }, 404);
        await logActivity(user, scenario.archived ? "Hid scenario" : "Showed scenario", `${scenario.title} (${flow.name})`);
        return json({ scenario });
      }
      default:
        return json({ error: "Unknown action." }, 400);
    }
  } catch (error) {
    return errorResponse(error);
  }
}
