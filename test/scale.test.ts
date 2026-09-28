import postgres from 'postgres'
import { afterAll, describe, expect, it } from 'vitest'
import { GET as status } from '../api/auth.ts'
import { POST as admin } from '../api/admin.ts'
import { POST as classes } from '../api/classes.ts'
import { POST as coach } from '../api/coach.ts'
import { POST as flows } from '../api/flows.ts'
import { POST as scenarios } from '../api/scenarios.ts'
import { agentTurn, fake, hasDb, withEnv } from './helpers.ts'
import { admin as adminBrowser, agent, newClass, trainer } from './people.ts'

const sql = hasDb ? postgres(process.env.TEST_DATABASE_URL!, { max: 1 }) : null
afterAll(async () => {
  await sql?.end()
})

const flowInput = {
  name: 'Renewal call',
  company: 'Northwind',
  purpose: 'Offer a renewal.',
  endGoal: 'They renew',
  steps: [
    { label: 'Greeting', guide: 'Say who you are.' },
    { label: 'Offer', guide: 'Explain the renewal.' },
  ],
  rules: [],
}

describe.skipIf(!hasDb)('many people at once (database)', () => {
  it('handles 40 agents signing up and practicing at the same moment', async () => {
    const t = await trainer('Busy Trainer')
    const cls = await newClass(t, 'Big class')
    const agents = await Promise.all(Array.from({ length: 40 }, (_, i) => agent(cls.classCode, `Agent ${i + 1}`)))

    // Everyone's first reply and score land at once (the signing secret is also created on first use here).
    const replies = await Promise.all(
      agents.map((a) => a.post(coach, { action: 'reply', scenarioId: 'cooperative', transcript: agentTurn() })),
    )
    expect(replies.every((r) => r.status === 200 && r.body.signature)).toBe(true)

    const scores = await Promise.all(
      agents.map((a, i) =>
        a.post(coach, {
          action: 'score',
          scenarioId: 'cooperative',
          transcript: [...agentTurn(), { speaker: 'prospect', text: replies[i].body.text }],
          signature: replies[i].body.signature,
          startedAt: new Date().toISOString(),
          durationSec: 60,
        }),
      ),
    )
    expect(scores.map((r) => r.status)).toEqual(Array(40).fill(200))
    expect(scores.every((r) => r.body.saved)).toBe(true)

    const dash = (await t.post(classes, { action: 'dashboard', classId: cls.id })).body
    expect(dash.attempts).toHaveLength(40)
    expect(dash.agents).toHaveLength(40)
    const [{ secrets }] = await sql!`select count(*)::int as secrets from app_settings where key = 'signing_secret'`
    expect(secrets).toBe(1)
    const [{ count }] = await sql!`
      select coalesce(sum(count), 0)::int as count from ai_usage_daily where kind in ('reply', 'score')
    `
    expect(count).toBeGreaterThanOrEqual(80)
  })

  it('stops a second trainer from silently overwriting a call flow or scenario', async () => {
    const t1 = await trainer('First Editor')
    const t2 = await trainer('Second Editor')
    const flow = (await t1.post(flows, { action: 'create', flow: flowInput })).body.flow

    // Both open the same version; the first save wins, the second is refused.
    const first = await t1.post(flows, { action: 'update', id: flow.id, updatedAt: flow.updatedAt, flow: { ...flowInput, name: 'One' } })
    expect(first.status).toBe(200)
    const second = await t2.post(flows, { action: 'update', id: flow.id, updatedAt: flow.updatedAt, flow: { ...flowInput, name: 'Two' } })
    expect(second.status).toBe(409)
    expect(second.body.error).toMatch(/Someone else changed this call flow/)
    // Saving again from the latest version works.
    const retry = await t2.post(flows, { action: 'update', id: flow.id, updatedAt: first.body.flow.updatedAt, flow: { ...flowInput, name: 'Two' } })
    expect(retry.body.flow.name).toBe('Two')

    const { body: drafted } = await t1.post(scenarios, { action: 'draft', flowId: flow.id, description: 'x' })
    const scenario = (await t1.post(scenarios, { action: 'create', flowId: flow.id, scenario: drafted.draft })).body.scenario
    const edit = (who: typeof t1, title: string, updatedAt: string) =>
      who.post(scenarios, { action: 'update', flowId: flow.id, id: scenario.id, updatedAt, scenario: { ...drafted.draft, title } })
    expect((await edit(t1, 'A', scenario.updatedAt)).status).toBe(200)
    expect((await edit(t2, 'B', scenario.updatedAt)).status).toBe(409)
  })

  it('tells people the AI is busy instead of failing mysteriously, without raising an alarm', async () => {
    const t = await trainer('Calm Trainer')
    const sam = await agent((await newClass(t)).classCode)
    fake().setMode('overloaded')
    const res = await sam.post(coach, { action: 'reply', scenarioId: 'cooperative', transcript: agentTurn() })
    expect(res.status).toBe(503)
    expect(res.body.error).toMatch(/very busy right now/)
    expect((await t.get(status)).body.aiProblem).toBeNull()
  })

  it('warns trainers and admins as the daily limit gets close', async () => {
    const a = await adminBrowser()
    const t = await trainer('Watchful Trainer')
    const sam = await agent((await newClass(t)).classCode)
    await sam.post(coach, { action: 'reply', scenarioId: 'cooperative', transcript: agentTurn() })
    const [{ used }] = await sql!`select coalesce(sum(count), 0)::int as used from ai_usage_daily where kind <> 'signin'`

    await withEnv({ CALLCRAFT_DAILY_AI_LIMIT: String(used + 1) }, async () => {
      expect((await t.get(status)).body.usageWarning).toMatch(/% of the daily limit/)
      expect((await sam.get(status)).body.usageWarning).toBeNull()
    })
    await withEnv({ CALLCRAFT_DAILY_AI_LIMIT: String(used) }, async () => {
      expect((await a.get(status)).body.usageWarning).toMatch(/used up/)
    })
    await withEnv({ CALLCRAFT_DAILY_AI_LIMIT: String(used * 100) }, async () => {
      expect((await a.get(status)).body.usageWarning).toBeNull()
    })
    expect((await a.post(admin, { action: 'status' })).body.usage.today.reply).toBeGreaterThan(0)
  })
})
