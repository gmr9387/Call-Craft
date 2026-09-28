import { canManageClass, requireUser, type User } from "../server/auth.js";
import { prospectReply, scoreCall } from "../server/coach.js";
import { classById, saveAttempt, scenarioWithClass } from "../server/db.js";
import { flowForClass } from "../server/flows.js";
import { BUILTIN_FLOW, type CallFlow } from "../shared/flows.js";
import { errorResponse, json, readJson } from "../server/http.js";
import { checkUsage } from "../server/limits.js";
import { getScenario, isCustomScenarioId, type Scenario, type Turn } from "../shared/scenarios.js";

const MAX_TURNS = 80;
const MAX_TURN_CHARS = 2000;
const MAX_DURATION_SEC = 4 * 60 * 60;

function parseTranscript(value: unknown): Turn[] | null {
  if (!Array.isArray(value) || value.length > MAX_TURNS) return null;
  const turns: Turn[] = [];
  for (const item of value) {
    if (
      !item ||
      (item.speaker !== "agent" && item.speaker !== "prospect") ||
      typeof item.text !== "string" ||
      item.text.length > MAX_TURN_CHARS
    ) {
      return null;
    }
    turns.push({ speaker: item.speaker, text: item.text });
  }
  return turns;
}

// Built-in scenarios resolve by slug and use the built-in sample flow. A trainer-built scenario
// uses its class's call flow, and can be used by agents in that class and by the trainers and
// admins who manage it.
async function resolveScenario(user: User, scenarioId: unknown): Promise<{ scenario: Scenario; flow: CallFlow } | null> {
  if (typeof scenarioId !== "string") return null;
  if (!isCustomScenarioId(scenarioId)) {
    const scenario = getScenario(scenarioId);
    return scenario ? { scenario, flow: BUILTIN_FLOW } : null;
  }
  const found = await scenarioWithClass(scenarioId);
  if (!found) return null;
  const allowed =
    (user.role === "agent" && user.classId === found.classId) || (await canManageClass(user, found.classId));
  return allowed ? { scenario: found.scenario, flow: await flowForClass(found.classId) } : null;
}

// Simulator endpoint: the AI prospect's next line, or the call scorecard.
// Scored calls are saved by the server to the signed-in person (and an agent's class),
// so the score a trainer sees is the one the server produced. Trainer preview calls send
// save: false so they don't show up as practice calls.
export async function POST(request: Request): Promise<Response> {
  const body = await readJson(request);
  if (!body) return json({ error: "Invalid JSON body." }, 400);

  const transcript = parseTranscript(body.transcript);
  if (!transcript) return json({ error: "Invalid transcript." }, 400);

  try {
    const user = await requireUser(request);
    const resolved = await resolveScenario(user, body.scenarioId);
    if (!resolved) return json({ error: "Unknown scenario." }, 400);
    const { scenario, flow } = resolved;
    const classId = user.role === "agent" ? user.classId : null;

    if (body.action === "reply") {
      await checkUsage("reply", request, null, user.id);
      return json({ text: await prospectReply(scenario, flow, transcript) });
    }
    if (body.action !== "score") {
      return json({ error: "Unknown action." }, 400);
    }

    await checkUsage("score", request, null, user.id);
    const scorecard = await scoreCall(scenario, flow, transcript);
    if (body.save === false) {
      return json({ scorecard, saved: false });
    }

    const startedAt = typeof body.startedAt === "string" ? new Date(body.startedAt) : null;
    const durationSec = Number(body.durationSec);
    if (
      !startedAt ||
      Number.isNaN(startedAt.getTime()) ||
      !Number.isInteger(durationSec) ||
      durationSec < 0 ||
      durationSec > MAX_DURATION_SEC
    ) {
      return json({
        scorecard,
        saved: false,
        saveError: "The call details were incomplete, so it wasn't saved.",
      });
    }

    try {
      // The class may have been deleted since the agent joined it.
      const cls = classId ? await classById(classId) : null;
      const id = await saveAttempt({
        userId: user.id,
        classId: cls?.id ?? null,
        agentName: user.name,
        scenarioId: scenario.id,
        scenarioTitle: scenario.title,
        startedAt: startedAt.toISOString(),
        durationSec,
        transcript,
        scorecard,
      });
      return json({ scorecard, saved: true, attemptId: id, className: cls?.name ?? null });
    } catch (error) {
      // Never lose the scorecard because the save failed.
      console.error("Saving attempt failed:", error);
      return json({ scorecard, saved: false, saveError: "The call was scored but couldn't be saved." });
    }
  } catch (error) {
    return errorResponse(error);
  }
}
