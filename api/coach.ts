import { requireUser, type User } from "../server/auth.js";
import { prospectReply, scoreCall } from "../server/coach.js";
import { classById, purgeOldCalls, resolveFlow, saveAttempt, scenarioWithFlow } from "../server/db.js";
import { retentionDays } from "../server/settings.js";
import { signTranscript, verifyTranscript } from "../server/signing.js";
import { BUILTIN_FLOW, type CallFlow } from "../shared/flows.js";
import { errorResponse, json, readJson } from "../server/http.js";
import { checkUsage } from "../server/limits.js";
import { END_MARKERS, getScenario, isCustomScenarioId, type Scenario, type Turn } from "../shared/scenarios.js";

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
// uses the call flow it belongs to. Agents can use it when their class is on that flow;
// trainers and admins can use any (flows and their scenarios are shared by all trainers).
async function resolveScenario(user: User, scenarioId: unknown): Promise<{ scenario: Scenario; flow: CallFlow } | null> {
  if (typeof scenarioId !== "string") return null;
  if (!isCustomScenarioId(scenarioId)) {
    const scenario = getScenario(scenarioId);
    return scenario ? { scenario, flow: BUILTIN_FLOW } : null;
  }
  const found = await scenarioWithFlow(scenarioId);
  if (!found) return null;
  if (user.role === "agent") {
    const cls = user.classId ? await classById(user.classId) : null;
    if (!cls || cls.flowId !== found.flowId) return null;
  }
  return { scenario: found.scenario, flow: await resolveFlow(found.flowId) };
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

    if (body.action !== "reply" && body.action !== "score") {
      return json({ error: "Unknown action." }, 400);
    }
    // Only conversations the server really had can continue or be scored.
    await verifyTranscript(user.id, scenario.id, transcript, body.signature);

    if (body.action === "reply") {
      await checkUsage("reply", request, null, user.id);
      const raw = await prospectReply(scenario, flow, transcript);
      // The end-of-call markers are taken out here, and the signature covers exactly the line
      // the browser adds to the conversation.
      const ended = raw.includes(END_MARKERS.transferred) ? "transferred" : raw.includes(END_MARKERS.hangUp) ? "hang_up" : null;
      let text = raw;
      for (const marker of Object.values(END_MARKERS)) text = text.replaceAll(marker, "");
      text = text.trim();
      const signature = text
        ? await signTranscript(user.id, scenario.id, [...transcript, { speaker: "prospect", text }])
        : (body.signature ?? null);
      return json({ text, ended, signature });
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
      // Now and then, delete calls older than the retention period set on the System page.
      if (Math.random() < 0.02) {
        const days = await retentionDays();
        if (days) await purgeOldCalls(days).catch((error) => console.error("Deleting old calls failed:", error));
      }
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
