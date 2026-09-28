# CallCraft

AI mock-call trainer for contact center agents. Agents run realistic practice calls with an AI prospect, then get a scorecard covering the call flow, compliance, and soft skills, with specific coaching tips.

It's built so a small team can run it for many agents without a developer. Trainers set up any kind of call on screen (the steps, the rules, and the practice callers), and admins manage people, classes, and AI spending in the app.

CallCraft ships with one sample call flow: a generic outbound inquiry call for a fictional school, **Lakeview State University**. All sample scenarios, names, and wording are made up; no client scripts or proprietary training material are used.

## What's in it

- **Call flows** (trainers and admins): a call flow is what agents are scored on: the company they call for, what the call is for, how a good call ends, the steps in order, and rules they must never break. Describe a call in a few sentences and click **Write it for me**, or build one by hand. Each class uses one call flow; replies, scoring, scenario drafts, and the agent's call guide all follow it. Flows can be copied, edited, and archived.
- **Six sample scenarios** on the sample call flow, each with a different prospect:
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
- **Accounts** (email and password), with three roles:
  - **Admin**: invites trainers (and other admins), sees every class, resets passwords, and turns accounts off. The very first account on a new deployment becomes the admin.
  - **Trainer**: creates classes, sees their agents and results, builds scenarios, and makes password reset links for their agents.
  - **Agent**: signs up with a class code (or the class's sign-up link), practices, and sees their own calls on any computer.
  - No email service is needed: invites and password resets are one-time links (valid 7 days) that the admin or trainer copies and sends however they like.
- **Classes and trainer dashboard**:
  - A trainer creates a class, for example one certification class, and shares its **class code** or **sign-up link** with agents.
  - Every call an agent scores is saved by the server to the agent and their class, so trainers see the score the server produced, not one sent from the browser.
  - Each class has a **Results** tab, an **Agents** tab (roster, calls, average score, last active, reset password, remove), and a **Scenarios** tab. Results show:
    - **By agent:** calls, average score, pass rate, compliance issues, most-missed call step, last practiced
    - **By scenario:** calls, average score, pass rate
    - **All calls:** each call, with its full scorecard and transcript
- **Scenario builder** (trainers): describe a caller in one sentence and click **Write it for me**. The AI fills in the scenario: name, difficulty, what to practice, who the caller is and how they act, and what the agent must do to pass. The trainer edits anything, saves, and can **Try it** right away; trial calls aren't saved. Agents in the class see these scenarios under **From your trainer**. Trainers can hide a scenario from agents at any time.
- **Marketing page and sign-in**: the site opens on a simple marketing page with a **Sign in** button.
- **Class tools** (trainers and admins), on each class's tabs:
  - **Results**: scores by agent, by scenario, and every call, plus **Download results** as a spreadsheet (CSV that opens in Excel or Google Sheets).
  - **Agents**: roster with calls, average score, last active; **Edit** name/email, **Reset password**, **Move to** another class, **Remove**; download the list.
  - **Scenarios**: build, edit, try, and hide practice calls. Scenarios belong to the call flow, so every class on that flow (including next month's class) gets them automatically.
  - **Ready for live calls**: on Settings, pick the practice calls every agent must pass and a passing score. The Agents tab shows who is **Ready** (and how far along everyone else is), the agent list download includes it, and each agent sees a checklist on their dashboard.
  - **Settings**: rename, change the call flow, archive (the code stops working; results are kept) or bring back, and for admins, hand the class to another trainer.
- **Trainer reviews**: on any call in their class, a trainer writes a note for the agent and can correct the score and result. The agent sees the note on that call; corrected scores count for "Ready" and show everywhere scores do (the AI's score is kept and shown alongside).
- **Unfinished calls come back**: the call in progress is kept in the browser as it goes. After a refresh, crash, or leaving mid-call, a banner offers to go back to it.
- **People** (admins): invite trainers and admins, edit names and emails, reset passwords, turn accounts off, and **delete** a person with all their practice calls (confirmed by typing their email).
- **System** (admins): AI requests today and for the last 7 days, how many people and classes are active, a one-click health check, the **spending limits**, how long **practice calls are kept** (30+ days, or forever; older calls are deleted automatically), and the **activity log** of who invited, reset, changed, or deleted what (downloadable). If the AI stops working (bad key, no credit), trainers and admins see a red banner on every page, and the System page says what's wrong.
- **Help**: short answers for each role, and a getting-started guide for new trainers.
- **Privacy and terms**: a plain-language page (linked from the marketing page and Help) on what's kept, who sees it, how it's processed, and how to have it deleted. The call screen reminds agents never to type real customer information. Have your own counsel review this page before real use.
- **Left menu by role**: agents see Dashboard, Practice, My calls. Trainers see Classes, Call flows, Practice, My calls. Admins also see People and System. Everyone has Help, Account (change password), and Sign out.
- **Agent dashboard**: the next call to practice, your class, three numbers (calls, average score, calls passed), and your recent calls.
- **Desktop only**: the app itself needs a window at least 900px wide, like an agent's real workstation. On phones it asks the person to use a computer. The marketing page works on any screen.
- **Light theme everywhere**, regardless of the computer's dark mode setting.

## How it works

| Path | What it is |
|---|---|
| `shared/scenarios.ts` | Call flow, scenarios, and hidden prospect personas |
| `shared/scorecard.ts` | Scorecard schema (Zod) |
| `shared/classes.ts` | Class and saved-call types |
| `shared/scenarioInput.ts` | Scenario builder fields and validation (Zod) |
| `server/coach.ts` | Claude calls: the prospect's next line (low effort, for fast replies) and the structured scorecard (high effort) |
| `shared/accounts.ts` | Roles and account types |
| `shared/flows.ts`, `shared/flowInput.ts` | Call flow types, the sample flow, and validation |
| `server/flows.ts` | Call flow storage |
| `server/settings.ts` | In-app settings (spending limits, data retention) and the last AI problem |
| `server/audit.ts` | Activity log |
| `server/auth.ts` | Passwords (scrypt), sessions (httpOnly cookie), invite and reset links, access checks |
| `server/db.ts` | Postgres access: classes, saved calls, dashboards, scenarios |
| `server/limits.ts` | Spending limits on AI requests |
| `api/auth.ts` | `GET /api/auth` (who is signed in); `POST`: `login`, `logout`, `setup`, `signup`, `link`, `accept`, `reset`, `password` |
| `api/people.ts` | `POST /api/people`: `list`, `invite`, `reset-link`, `update`, `disable`, `delete` |
| `api/calls.ts` | `GET /api/calls`: your scored calls |
| `api/coach.ts` | `POST /api/coach` (signed in): `action: "reply" \| "score"`; `score` saves the call to you and your class |
| `api/classes.ts` | `POST /api/classes`: `list`, `create`, `dashboard`, `update`, `reassign`, `remove-agent`, `move-agent`, `review`, `mine`, `join` |
| `api/health.ts` | `GET /api/health`: is the AI key working, is the database connected |
| `api/flows.ts` | `POST /api/flows` (trainers and admins): `list`, `draft`, `create`, `update`, `archive` |
| `api/admin.ts` | `POST /api/admin` (admins): `status`, `limits`, `check-ai`, `retention` |
| `api/scenarios.ts` | `POST /api/scenarios` (trainers and admins; by call flow): `action: "draft" \| "create" \| "update" \| "archive"` |
| `db/schema.sql` | Database schema (safe to re-run) |
| `src/` | React UI |

The API key and database connection only live on the server; the browser never talks to the database.

**Models and cost.** By default everything uses `claude-haiku-4-5`, the lowest-cost current Claude model. Override per deployment:
- `CALLCRAFT_MODEL`: the prospect's replies
- `CALLCRAFT_SCORING_MODEL`: scoring and scenario drafts (defaults to `CALLCRAFT_MODEL`)

For example, set `CALLCRAFT_SCORING_MODEL=claude-opus-5` for more careful scoring at a higher cost. The effort setting is only sent to models that support it. The server-side refusal fallback is only used with Claude Opus 5 and Claude Fable 5.1.

## Spending limits

Every AI request (a caller reply, a score, a scenario draft, a health check) is counted before it goes to Anthropic, so a stuck script or a busy day can't run up the bill. When a limit is hit, the person sees a plain message ("today's practice limit was reached", "you're going a little fast") and no AI request is made.

| Setting | Default | What it limits |
|---|---|---|
| `CALLCRAFT_DAILY_AI_LIMIT` | 1500 | AI requests per day, whole site |
| `CALLCRAFT_HOURLY_CLIENT_LIMIT` | 120 | AI requests per hour from one person (a whole training room behind one office IP address doesn't share a limit) |
| `CALLCRAFT_DAILY_DRAFT_LIMIT` | 25 | "Write it for me" scenario drafts per call flow per day |
| `CALLCRAFT_HOURLY_HEALTH_LIMIT` | 10 | `/api/health` AI checks per hour from one computer |

A practice call is usually 10–20 requests, so the default daily limit covers roughly 75–150 calls. **Admins change the first three limits on the System page**; a value saved there wins over the environment variable, which wins over the default. Counts are kept in the `ai_usage` table (computers are stored only as a salted hash; set `CALLCRAFT_USAGE_SALT` to any random text). Without a database, counts are kept in memory instead. AI requests also time out after 60 seconds and retry once.

## Database

CallCraft needs Postgres for accounts, classes, and saved calls.

1. Create a Postgres database. On Supabase, use a new project just for CallCraft.
2. Run `db/schema.sql` against it. On Supabase, paste it into the SQL editor.
3. Set `DATABASE_URL`. On Supabase, use the **transaction pooler** connection string (port 6543), which works well with serverless functions.

Row-level security is on with no policies, so Supabase's public REST API can't read these tables. Only the server reaches them.

**Updating an existing database:** re-run `db/schema.sql`. It only adds what's missing.

## Accounts and security

- **First run:** on a brand-new deployment, the site opens a **Set up CallCraft** page. The first account made there becomes the admin, and the page never appears again. Do this right after deploying.
- **Passwords** are stored as scrypt hashes. **Sessions** are a random token in an httpOnly, SameSite=Lax cookie (Secure on https), valid 30 days; only a hash of the token is stored.
- **Links** for invites and password resets work once and expire after 7 days. Making a new reset link cancels the old one. Using a reset link signs the person out everywhere else.
- **Turning an account off** signs it out everywhere and blocks sign-in until an admin turns it back on.
- **Wrong passwords** and wrong class codes are limited per computer (`CALLCRAFT_HOURLY_SIGNIN_FAILURES`, default 20 an hour).
- The API only accepts JSON requests, so other websites can't submit forms as a signed-in person.
- Agents only see their own calls. Trainers only see classes they run. Admins see everything.

## Run locally

```bash
npm install
cp .env.example .env   # then set ANTHROPIC_API_KEY and DATABASE_URL
npm run dev
```

`npm run dev` serves the API through a small Vite plugin, so local development runs the same handler as production.

## Deploy

Deploy to Vercel as a Vite project and set `ANTHROPIC_API_KEY` and `DATABASE_URL` in the project's environment variables. The files in `api/` become serverless functions automatically.

## Health check

Open `/api/health` on any deployment (for example `https://your-site.vercel.app/api/health`). It reports whether the Anthropic key is set and working (with Anthropic's exact error if not, such as a rejected key or low credit balance) and whether the database is connected. It never shows keys or connection strings, and it makes one tiny AI request.

## Checks

```bash
npm run build   # type-checks the app, server, and API, then builds
npm run lint
npm test        # API tests with a fake AI (no Anthropic key or credit needed)
```

The tests never call the real Anthropic API. Class and scenario tests also need Postgres; point `TEST_DATABASE_URL` at an empty database (the tests apply `db/schema.sql` themselves). Without it those tests are skipped.

```bash
TEST_DATABASE_URL=postgres://postgres@localhost:5432/callcraft npm test
```

GitHub Actions runs lint, build, and all tests (with a Postgres service) on every pull request and on `main`.

## Next steps

- Real-time voice calls instead of browser speech.
- Company sign-in (single sign-on) if a client's IT asks for it.
