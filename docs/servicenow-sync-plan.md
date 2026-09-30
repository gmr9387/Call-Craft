# ServiceNow readiness sync: plan

Status: **planned, not built.** Start after the real AI has been tested with Anthropic credit.

**Goal:** when an agent becomes ready for live calls in CallCraft, ServiceNow gets a readiness record and ops gets a task to schedule their go-live. Trainers, ops and IT see readiness where they already work.

**Cost:** $0. A free ServiceNow Personal Developer Instance (PDI) from developer.servicenow.com, and no new paid services.

---

## What happens in ServiceNow

| Piece | What it does |
|---|---|
| **Scoped app "CallCraft"** | Holds everything below as one clean package |
| **CallCraft Readiness table** | One record per agent per class |
| **Import set + transform map** | CallCraft sends rows in, and ServiceNow updates the matching record instead of creating duplicates (it coalesces on CallCraft Key) |
| **Flow (Flow Designer)** | When an agent turns ready, it creates a "Schedule go-live" task for ops and sends an email |
| **Roles and ACLs** | Only the integration user can write readiness records; trainers and ops can read them |
| **List view, report, dashboard** | "Ready for live calls" and "Readiness by class" |
| **Later: incident** | If CallCraft's AI stops working, it opens an incident so IT sees it in ServiceNow |

## What gets sent (and what doesn't)

One row per agent per class:

| Field | Example |
|---|---|
| CallCraft Key | Links the row to one agent in one class |
| Agent Name, Agent Email | Jordan Lee, jordan@example.com |
| Class Name | "October new hires" |
| Ready for Live Calls | true |
| Ready Date | 2026-10-14 |
| Required Passed, Required Total | 4, 5 |
| Average Score, Best Score | 84, 96 |
| Practice Calls | 23 |
| Last Practice | 2026-10-15 09:30:00 |
| CallCraft Link | Opens the agent's results in CallCraft |

**Never sent:** call transcripts, trainer notes, passwords. Only the summary goes out, which keeps IT and privacy reviews simple. The Security and trust page gets one new line saying this whenever the sync is turned on.

---

## How it works

1. An agent finishes a call, or a trainer changes a score, and their readiness changes.
2. CallCraft adds a "send this" entry to a small queue in its own database.
3. A sender posts the queue to ServiceNow's Import Set API. The transform map updates the matching readiness record, or creates it the first time.
4. If ServiceNow is down or asleep (free instances go to sleep), the entry stays queued and retries, so **practice never breaks because of ServiceNow.**
5. A **Sync now** button, plus a daily catch-up run, covers anything missed.

**Connection:** CallCraft signs in as a dedicated ServiceNow integration user that can only load CallCraft readiness data. It uses OAuth (client credentials) where the instance supports it; on a free developer instance, the integration user's password over HTTPS is the fallback. The keys go into Vercel as environment variables, added by the owner. Keys are never pasted in chat or committed to the repo.

---

## Phases

### Phase 1: ServiceNow setup (owner, about one evening)
Get a PDI, then create the scoped app, the readiness table, the import set table and transform map, and the integration user. Put the keys in Vercel.

### Phase 2: CallCraft side (code)
- The queue table and the sender.
- A **ServiceNow** section on the System page:
  - an on/off switch
  - a "Test connection" button
  - the last sync time
  - a plain-English message when something fails
- Retries, the daily catch-up, and entries in the activity log.
- Tests against a fake ServiceNow, the same way the AI is tested against a fake Anthropic.
- README and Security page updates.

### Phase 3: ServiceNow showcase (owner; doubles as cert study)
- A Flow: when Ready for Live Calls turns true, create a "Schedule go-live" task and email ops.
- A "Ready for live calls" list view, a "Readiness by class" report, and a dashboard.
- Read access for trainer and ops roles.

Phases 1 and 3 cover core **ServiceNow Certified System Administrator (CSA)** topics (tables, import sets, transform maps, flows, roles and ACLs, reports), and the scoped app is a step toward **Certified Application Developer (CAD)**.

### Phase 4: later
- Open an incident in ServiceNow when CallCraft's AI stops working.
- In a customer's ServiceNow: their admin installs the scoped app, their IT creates the integration user, and their keys go into CallCraft's settings. **No code changes.**

---

## Keeping the free instance alive
- A PDI goes to sleep when unused, and ServiceNow can reclaim it after a stretch without logins. Log in every few days.
- Link the scoped app to a private GitHub repo from ServiceNow Studio's source control, so the work survives if the instance is reclaimed.

## Not included (on purpose)
- Reading data back *from* ServiceNow
- Creating CallCraft classes from ServiceNow catalog requests
- Single sign-on
- Salesforce (it could be added later on the same design)

## Demo script
An agent passes their last required practice call in CallCraft. Switch to ServiceNow: the readiness record shows **Ready**, a "Schedule go-live" task appears in the ops queue, and the dashboard updates.

## Rules this plan keeps
- Built and demoed only on a free developer instance, with made-up data. No customer data or materials are used to build it.
- No certification is claimed until the exam is passed.
