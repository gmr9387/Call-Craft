import { describe, expect, it } from 'vitest'
import { POST as classes } from '../api/classes.ts'
import { POST as coach } from '../api/coach.ts'
import { POST as scenarios } from '../api/scenarios.ts'
import { agentTurn, hasDb, withEnv } from './helpers.ts'
import { agent, newClass, trainer } from './people.ts'

describe.skipIf(!hasDb)('scenario builder (database)', () => {
  it('drafts only for trainers who run the class', async () => {
    const t = await trainer()
    const other = await trainer('Other Trainer')
    const cls = await newClass(t)
    const sam = await agent(cls.classCode)
    const draft = { action: 'draft', classId: cls.id, description: 'Wants night classes' }

    expect((await sam.post(scenarios, draft)).status).toBe(403)
    expect((await other.post(scenarios, draft)).status).toBe(404)
    const res = await t.post(scenarios, draft)
    expect(res.status).toBe(200)
    expect(res.body.draft.title).toBe('Night classes only')
  })

  it('limits drafts per class per day', async () => {
    const t = await trainer()
    const cls = await newClass(t)
    await withEnv({ CALLCRAFT_DAILY_DRAFT_LIMIT: '1' }, async () => {
      expect((await t.post(scenarios, { action: 'draft', classId: cls.id, description: 'a' })).status).toBe(200)
      const blocked = await t.post(scenarios, { action: 'draft', classId: cls.id, description: 'b' })
      expect(blocked.status).toBe(429)
    })
  })

  it('creates, updates, and hides scenarios, and keeps them inside their class', async () => {
    const t = await trainer()
    const a = await newClass(t, 'Class A')
    const b = await newClass(t, 'Class B')
    const other = await trainer('Other Trainer')
    const agentA = await agent(a.classCode, 'In A')
    const agentB = await agent(b.classCode, 'In B')

    const { body: drafted } = await t.post(scenarios, { action: 'draft', classId: a.id, description: 'x' })
    const create = (scenario: unknown) => t.post(scenarios, { action: 'create', classId: a.id, scenario })
    expect((await create({ ...drafted.draft, persona: 'short' })).status).toBe(400)
    const created = await create(drafted.draft)
    expect(created.status).toBe(200)
    const id = created.body.scenario.id

    // Another trainer can't edit it, and agents in another class can't use it.
    const update = { action: 'update', classId: a.id, id, scenario: drafted.draft }
    expect((await other.post(scenarios, update)).status).toBe(404)
    expect((await t.post(scenarios, { ...update, classId: b.id })).status).toBe(404)
    const reply = { action: 'reply', scenarioId: id, transcript: agentTurn() }
    expect((await agentB.post(coach, reply)).status).toBe(400)
    expect((await agentA.post(coach, reply)).status).toBe(200)
    expect((await t.post(coach, reply)).status).toBe(200)

    const renamed = await t.post(scenarios, { ...update, scenario: { ...drafted.draft, title: 'Renamed' } })
    expect(renamed.body.scenario.title).toBe('Renamed')

    await t.post(scenarios, { action: 'archive', classId: a.id, id, archived: true })
    const mine = await agentA.post(classes, { action: 'mine' })
    expect(mine.body.joined.scenarios).toHaveLength(0)
  })
})
