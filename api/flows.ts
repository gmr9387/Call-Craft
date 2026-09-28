import { requireUser } from "../server/auth.js";
import { logActivity } from "../server/audit.js";
import { draftFlow } from "../server/coach.js";
import { createFlow, listFlows, setFlowArchived, updateFlow } from "../server/flows.js";
import { checkUsage } from "../server/limits.js";
import { cleanId, cleanText, errorResponse, json, readJson } from "../server/http.js";
import { FlowInput } from "../shared/flowInput.js";

const NOT_FOUND = "That call flow wasn't found.";

// Call flow endpoint, for trainers and admins. Flows are shared by everyone who runs classes.
// - "list": every call flow, including the built-in sample
// - "draft": turn a description of the call into a full flow draft (not saved)
// - "create" / "update": save a flow
// - "archive": hide a flow from new classes, or bring it back
export async function POST(request: Request): Promise<Response> {
  const body = await readJson(request);
  if (!body) return json({ error: "Invalid JSON body." }, 400);

  try {
    const user = await requireUser(request, "admin", "trainer");

    switch (body.action) {
      case "list":
        return json({ flows: await listFlows() });
      case "draft": {
        const description = cleanText(body.description, 4000);
        if (!description) return json({ error: "Describe the call in a few sentences." }, 400);
        await checkUsage("draft", request, null, user.id);
        return json({ draft: await draftFlow(description) });
      }
      case "create":
      case "update": {
        const parsed = FlowInput.safeParse(body.flow);
        if (!parsed.success) {
          return json({ error: parsed.error.issues[0]?.message ?? "Check the call flow fields." }, 400);
        }
        if (body.action === "create") {
          const flow = await createFlow(user.id, parsed.data);
          await logActivity(user, "Created call flow", flow.name);
          return json({ flow });
        }
        const id = cleanId(body.id);
        const flow = id ? await updateFlow(id, parsed.data) : null;
        if (!flow) return json({ error: NOT_FOUND }, 404);
        await logActivity(user, "Edited call flow", flow.name);
        return json({ flow });
      }
      case "archive": {
        const id = cleanId(body.id);
        const flow = id ? await setFlowArchived(id, body.archived === true) : null;
        if (!flow) return json({ error: NOT_FOUND }, 404);
        await logActivity(user, flow.archived ? "Archived call flow" : "Brought back call flow", flow.name);
        return json({ flow });
      }
      default:
        return json({ error: "Unknown action." }, 400);
    }
  } catch (error) {
    return errorResponse(error);
  }
}
