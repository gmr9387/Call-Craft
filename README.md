# CallCraft

AI mock-call trainer for contact center agents. Agents run realistic practice calls with an AI prospect, then get a scorecard covering the call flow, compliance, and soft skills, with specific coaching tips.

The first version covers a generic outbound higher-ed inquiry call for a fictional school, **Lakeview State University**. All scenarios, names, and wording are made up; no client scripts or proprietary training material are used.

## What's in it

- **Six practice scenarios** on the same call flow, each with a different prospect:
  - Ready to talk (easy)
  - Someone else picks up
  - "I never asked for this"
  - "Just tell me the price"
  - Military spouse, busy household
  - "Take me off your list" (hard)
- **Live call screen**: type, or speak with the browser mic (Chrome/Edge). The prospect's lines can be read aloud. There's an optional call guide, and the call ends automatically when the prospect hangs up or accepts the transfer.
- **Scorecard**:
  - Overall score and pass / needs work / fail
  - Each call-flow step with evidence from the call
  - Compliance checks: do-not-call, no quoting costs or aid, disclosure before questions, no third-party qualifying
  - Scenario goals
  - Five soft-skill scores
  - Coaching tips
- **Trainer view**: every scored call saved in the browser, filterable by agent, with averages and pass rates per scenario.

## How it works

| Path | What it is |
|---|---|
| `shared/scenarios.ts` | Call flow, scenarios, and hidden prospect personas |
| `shared/scorecard.ts` | Scorecard schema (Zod) |
| `server/coach.ts` | Claude calls: the prospect's next line (low effort, for fast replies) and the structured scorecard (high effort) |
| `api/coach.ts` | Single serverless endpoint (`POST /api/coach` with `action: "reply" \| "score"`) |
| `src/` | React UI |

The API key only lives on the server. The default model is `claude-opus-5`, and the server-side refusal fallback is enabled.

## Run locally

```bash
npm install
cp .env.example .env   # then set ANTHROPIC_API_KEY
npm run dev
```

`npm run dev` serves the API through a small Vite plugin, so local development runs the same handler as production.

## Deploy

Deploy to Vercel as a Vite project and set `ANTHROPIC_API_KEY` in the project's environment variables. `api/coach.ts` becomes a serverless function automatically.

## Checks

```bash
npm run build   # type-checks the app, server, and API, then builds
npm run lint
```

## Next steps

- Sync results to a database so trainers can see a whole certification class.
- Let trainers add their own scenarios and scripts (under the client's permission during a pilot).
- Real-time voice calls instead of browser speech.
