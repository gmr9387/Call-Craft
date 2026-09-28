import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { dbOrNull } from "./db.js";
import { env } from "./env.js";
import type { Turn } from "../shared/scenarios.js";

// Practice calls are only scored as they really happened: every AI reply comes back with a
// signature over the conversation so far, and the server checks it before replying again or
// scoring. That stops anyone from typing the caller's lines themselves to fake a pass.
//
// The signing secret is CALLCRAFT_SIGNING_SECRET if set, otherwise a random secret created
// once and kept in the database, so no setup is needed.

let secret: Promise<string> | undefined;

async function loadSecret(): Promise<string> {
  const fromEnv = env("CALLCRAFT_SIGNING_SECRET");
  if (fromEnv) return fromEnv;
  const sql = dbOrNull();
  if (!sql) return randomBytes(32).toString("hex");
  const fresh = randomBytes(32).toString("hex");
  await sql`
    insert into app_settings (key, value) values ('signing_secret', ${sql.json(fresh)})
    on conflict (key) do nothing
  `;
  const [row] = await sql`select value from app_settings where key = 'signing_secret'`;
  return row.value as string;
}

function getSecret(): Promise<string> {
  secret ??= loadSecret().catch((error) => {
    secret = undefined;
    throw error;
  });
  return secret;
}

async function sign(userId: string, scenarioId: string, turns: Turn[]): Promise<string> {
  const payload = JSON.stringify([userId, scenarioId, turns.map((t) => [t.speaker, t.text])]);
  return createHmac("sha256", await getSecret()).update(payload).digest("hex");
}

export class TamperedCallError extends Error {
  constructor() {
    super("This call couldn't be checked, so it can't continue. Please start the call again.");
  }
}

// The conversation must be exactly what the server replied to, plus the agent's newest lines.
export async function verifyTranscript(
  userId: string,
  scenarioId: string,
  transcript: Turn[],
  signature: unknown,
): Promise<void> {
  const lastCaller = transcript.map((t) => t.speaker).lastIndexOf("prospect");
  if (lastCaller === -1) return;
  const expected = Buffer.from(await sign(userId, scenarioId, transcript.slice(0, lastCaller + 1)), "hex");
  const given = typeof signature === "string" && /^[0-9a-f]{64}$/.test(signature) ? Buffer.from(signature, "hex") : null;
  if (!given || !timingSafeEqual(expected, given)) throw new TamperedCallError();
}

export function signTranscript(userId: string, scenarioId: string, transcript: Turn[]): Promise<string> {
  return sign(userId, scenarioId, transcript);
}
