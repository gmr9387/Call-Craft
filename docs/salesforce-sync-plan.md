# Salesforce readiness sync: plan

Status: **planned, not built.** Start after the real AI has been tested with Anthropic credit.

**Goal:** when an agent becomes ready for live calls in CallCraft, their Salesforce record shows it automatically. Trainers and ops see readiness where they already work, without logging into CallCraft.

**Cost:** $0. A free Salesforce Developer Edition account, and no new paid services.

---

## What gets sent (and what doesn't)

Sent to Salesforce, one record per agent per class:

| Field | Example |
|---|---|
| Agent name, agent email | Jordan Lee, jordan@example.com |
| Class | "October new hires" |
| Ready for live calls | ✓ |
| Date they became ready | Oct 14 |
| Required calls passed | 4 of 5 |
| Average score, best score | 84, 96 |
| Practice calls done | 23 |
| Last practice | Oct 15 |
| Link | Opens the agent's results in CallCraft |

**Never sent:** call transcripts, trainer notes, passwords. Only the summary goes out, which keeps IT and privacy reviews simple. The Security and trust page gets one new line saying this whenever the sync is turned on.

---

## How it works

1. An agent finishes a call, or a trainer changes a score, and their readiness changes.
2. CallCraft adds a "send this" entry to a small queue in its own database.
3. A sender pushes the queue to Salesforce. If Salesforce is down or refuses the update, the entry stays queued and retries, so **practice never breaks because of Salesforce.**
4. Salesforce keeps one record per agent per class, and updates it instead of creating duplicates (an upsert on a CallCraft external ID).
5. A **Sync now** button, plus a daily catch-up run, covers anything missed.

**Connection:** CallCraft signs in as a dedicated Salesforce integration user with the minimum permissions: it can only write CallCraft records. It uses the standard server-to-server login (OAuth client credentials, which Salesforce sets up as an "External Client App"). The keys go into Vercel as environment variables, added by the owner. Keys are never pasted in chat or committed to the repo.

---

## Phases

### Phase 1: Salesforce setup (owner, about one evening)
A click-by-click guide will be written for this. Steps:
- Sign up for a free Salesforce Developer Edition.
- Create a **CallCraft Readiness** object with the fields above, plus an external ID field.
- Create a permission set limited to CallCraft Readiness records.
- Create the integration user and the app connection, then put the keys in Vercel.

### Phase 2: CallCraft side (code)
- The queue table and the sender.
- A **Salesforce** section on the System page:
  - an on/off switch
  - a "Test connection" button
  - the last sync time
  - a plain-English message when something fails
- Retries, the daily catch-up, and entries in the activity log.
- Tests against a fake Salesforce, the same way the AI is tested against a fake Anthropic.
- README and Security page updates.

### Phase 3: Salesforce showcase (owner; doubles as cert study)
Built in Salesforce with point-and-click tools, no code:
- A **"Ready for live calls"** list view.
- A **"Readiness by class"** report and dashboard.
- A **Flow**: when an agent turns ready, notify ops or create a follow-up task.
- A link from each readiness record to the matching Salesforce user or contact, matched by email.

These are core **Salesforce Platform App Builder** exam topics (data model, security, automation, reports), so this phase is exam practice and the demo at once.

### Phase 4: in a customer's Salesforce, only after a purchase
- Their Salesforce admin (or their Salesforce consultant) installs the same object and permission set.
- Their IT creates the integration user and the app connection.
- Their keys go into CallCraft's settings.
- **No code changes.**

---

## Not included (on purpose)
- Reading data back *from* Salesforce
- Phone systems
- Agent analytics tools
- Single sign-on

Each is a separate decision later.

## Questions for a customer's IT team
1. "Which Salesforce record represents an agent: a User, a Contact, or something custom?"
2. "Does your Salesforce edition allow API access for an integration user?" Some editions don't include it.
3. "Would you want readiness only, or practice scores too?"
4. "Who approves a new app connection in your Salesforce?"

## Demo script
An agent passes their last required practice call in CallCraft. Switch to Salesforce, and the agent now shows **Ready for live calls**, the dashboard updates, and ops gets a notification. It takes about 30 seconds and matches a trainer's daily workflow.

## Rules this plan keeps
- Built and demoed only on a free Salesforce Developer Edition, with made-up data. No customer data or materials are used to build it.
- No certification is claimed until the exam is passed.
