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
- **Classes and trainer dashboard**:
  - A trainer creates a class, for example one certification class. They get a **class code** to give agents and a private **trainer key**.
  - Agents enter the class code on the Practice page. Each call they score is saved to the class by the server, so trainers see the score the server produced, not one sent from the browser.
  - The trainer dashboard, opened with the trainer key from any device, shows:
    - **By agent:** calls, average score, pass rate, compliance issues, most-missed call step, last practiced
    - **By scenario:** calls, average score, pass rate
    - **All calls:** each call, with its full scorecard and transcript
- **Scenario builder** (trainers): describe a caller in one sentence and click **Write it for me**. The AI fills in the scenario: name, difficulty, what to practice, who the caller is and how they act, and what the agent must do to pass. The trainer edits anything, saves, and can **Try it** right away; trial calls aren't saved. Agents in the class see these scenarios under **From your trainer**. Trainers can hide a scenario from agents at any time.
- **This device**: calls are also kept in the browser, so the app works without a class or a database.
- **Marketing page and sign-in**: the site opens on a marketing page. **Sign in** currently lets anyone in with one click (development only; there are no accounts or passwords yet).
- **Desktop only**: the app itself needs a window at least 900px wide, like an agent's real workstation. On phones it asks the person to use a computer. The marketing page works on any screen.

## How it works

| Path | What it is |
|---|---|
| `shared/scenarios.ts` | Call flow, scenarios, and hidden prospect personas |
| `shared/scorecard.ts` | Scorecard schema (Zod) |
| `shared/classes.ts` | Class and saved-call types |
| `shared/scenarioInput.ts` | Scenario builder fields and validation (Zod) |
| `server/coach.ts` | Claude calls: the prospect's next line (low effort, for fast replies) and the structured scorecard (high effort) |
| `server/db.ts` | Postgres access: classes, saved calls, dashboard |
| `api/coach.ts` | `POST /api/coach`: `action: "reply" \| "score"`; `score` saves to the class when a class code is sent |
| `api/classes.ts` | `POST /api/classes`: `action: "create" \| "join" \| "dashboard"` |
| `api/scenarios.ts` | `POST /api/scenarios` (needs the trainer key): `action: "draft" \| "create" \| "update" \| "archive"` |
| `db/schema.sql` | Database schema (safe to re-run) |
| `src/` | React UI |

The API key and database connection only live on the server; the browser never talks to the database. The default model is `claude-opus-5`, and the server-side refusal fallback is enabled.

## Database

Class dashboards need Postgres. Without `DATABASE_URL` everything else still works, and calls are kept on each device only.

1. Create a Postgres database. On Supabase, use a new project just for CallCraft.
2. Run `db/schema.sql` against it. On Supabase, paste it into the SQL editor.
3. Set `DATABASE_URL`. On Supabase, use the **transaction pooler** connection string (port 6543), which works well with serverless functions.

Row-level security is on with no policies, so Supabase's public REST API can't read these tables. Only the server reaches them.

**Updating an existing database:** re-run `db/schema.sql`. It only adds what's missing.

**Access model (pilot-grade):** there are no user logins yet, and "Sign in" is a one-click bypass. Anyone with a class code can save calls to that class. Anyone with the trainer key can view all of that class's calls, so treat the key like a password. Real trainer and agent accounts are the next step before wider use.

## Run locally

```bash
npm install
cp .env.example .env   # then set ANTHROPIC_API_KEY (and DATABASE_URL for classes)
npm run dev
```

`npm run dev` serves the API through a small Vite plugin, so local development runs the same handler as production.

## Deploy

Deploy to Vercel as a Vite project and set `ANTHROPIC_API_KEY` and `DATABASE_URL` in the project's environment variables. The files in `api/` become serverless functions automatically.

## Checks

```bash
npm run build   # type-checks the app, server, and API, then builds
npm run lint
```

## Next steps

- Real sign-in (trainer and agent accounts) in place of the one-click bypass and shared codes and keys.
- Custom call flows, so scenarios can cover programs other than the higher-ed inquiry call.
- Let trainers add their own scenarios and scripts (under the client's permission during a pilot).
- Real-time voice calls instead of browser speech.
