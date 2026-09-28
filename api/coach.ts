import { prospectReply, scoreCall } from "../server/coach.js";
import { DbNotConfiguredError, saveAttempt } from "../server/db.js";
import { cleanText, errorResponse, json, readJson } from "../server/http.js";
import { getScenario, type Turn } from "../shared/scenarios.js";

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

// Simulator endpoint: the AI prospect's next line, or the call scorecard.
// When a class code is sent with "score", the server saves the scored call to that class,
// so the score a trainer sees is the one the server produced.
export async function POST(request: Request): Promise<Response> {
  const body = await readJson(request);
  if (!body) return json({ error: "Invalid JSON body." }, 400);

  const scenario = typeof body.scenarioId === "string" ? getScenario(body.scenarioId) : undefined;
  if (!scenario) return json({ error: "Unknown scenario." }, 400);
  const transcript = parseTranscript(body.transcript);
  if (!transcript) return json({ error: "Invalid transcript." }, 400);

  try {
    if (body.action === "reply") {
      return json({ text: await prospectReply(scenario, transcript) });
    }
    if (body.action !== "score") {
      return json({ error: "Unknown action." }, 400);
    }

    const scorecard = await scoreCall(scenario, transcript);
    if (body.classCode === undefined || body.classCode === null || body.classCode === "") {
      return json({ scorecard, saved: false });
    }

    const classCode = cleanText(body.classCode, 20);
    const agentName = cleanText(body.agentName, 120);
    const startedAt = typeof body.startedAt === "string" ? new Date(body.startedAt) : null;
    const durationSec = Number(body.durationSec);
    if (
      !classCode ||
      !agentName ||
      !startedAt ||
      Number.isNaN(startedAt.getTime()) ||
      !Number.isInteger(durationSec) ||
      durationSec < 0 ||
      durationSec > MAX_DURATION_SEC
    ) {
      return json({
        scorecard,
        saved: false,
        saveError: "The call details were incomplete, so it wasn't saved to your class.",
      });
    }

    try {
      const id = await saveAttempt({
        classCode,
        agentName,
        scenarioId: scenario.id,
        startedAt: startedAt.toISOString(),
        durationSec,
        transcript,
        scorecard,
      });
      return id
        ? json({ scorecard, saved: true, attemptId: id })
        : json({
            scorecard,
            saved: false,
            saveError: "That class code wasn't found, so the call wasn't saved to a class.",
          });
    } catch (error) {
      // Never lose the scorecard because the save failed.
      if (error instanceof DbNotConfiguredError) {
        return json({ scorecard, saved: false, saveError: "Class saving isn't set up on this server yet." });
      }
      console.error("Saving attempt failed:", error);
      return json({ scorecard, saved: false, saveError: "The call was scored but couldn't be saved to your class." });
    }
  } catch (error) {
    return errorResponse(error);
  }
}
