import { describe, expect, it } from 'vitest'
import { POST as classes } from '../api/classes.ts'
import { POST as coach } from '../api/coach.ts'
import { POST as scenarios } from '../api/scenarios.ts'
import { agentTurn, call, hasDb, withEnv } from './helpers.ts'

async function newClass() {
  const res = await call(classes, { action: 'create', name: `Scenario class ${Date.now()}` })
  return res.body as { classInfo: { classCode: string }; trainerKey: string }
}

describe.skipIf(!hasDb)('scenario builder (database)', () => {
  it('drafts only with a real trainer key', async () => {
    const { trainerKey } = await newClass()
    expect((await call(scenarios, { action: 'draft', description: 'x' })).status).toBe(401)
    expect((await call(scenarios, { action: 'draft', trainerKey: 'wrong', description: 'x' })).status).toBe(404)
    const res = await call(scenarios, { action: 'draft', trainerKey, description: 'Wants night classes' })
    expect(res.status).toBe(200)
    expect(res.body.draft.title).toBe('Night classes only')
  })

  it('limits drafts per class per day', async () => {
    const { trainerKey } = await newClass()
    await withEnv({ CALLCRAFT_DAILY_DRAFT_LIMIT: '1' }, async () => {
      expect((await call(scenarios, { action: 'draft', trainerKey, description: 'a' })).status).toBe(200)
      const blocked = await call(scenarios, { action: 'draft', trainerKey, description: 'b' })
      expect(blocked.status).toBe(429)
    })
  })

  it('creates, updates, and hides scenarios, and keeps them inside their class', async () => {
    const a = await newClass()
    const b = await newClass()
    const { body: drafted } = await call(scenarios, { action: 'draft', trainerKey: a.trainerKey, description: 'x' })

    expect((await call(scenarios, { action: 'create', trainerKey: a.trainerKey, scenario: { ...drafted.draft, persona: 'short' } })).status).toBe(400)
    const created = await call(scenarios, { action: 'create', trainerKey: a.trainerKey, scenario: drafted.draft })
    expect(created.status).toBe(200)
    const id = created.body.scenario.id

    // Another class's trainer can't edit it, and its agents can't use it.
    expect((await call(scenarios, { action: 'update', trainerKey: b.trainerKey, id, scenario: drafted.draft })).status).toBe(404)
    const reply = { action: 'reply', scenarioId: id, transcript: agentTurn() }
    expect((await call(coach, { ...reply, classCode: b.classInfo.classCode })).status).toBe(400)
    expect((await call(coach, { ...reply, classCode: a.classInfo.classCode })).status).toBe(200)

    const renamed = await call(scenarios, {
      action: 'update',
      trainerKey: a.trainerKey,
      id,
      scenario: { ...drafted.draft, title: 'Renamed' },
    })
    expect(renamed.body.scenario.title).toBe('Renamed')

    await call(scenarios, { action: 'archive', trainerKey: a.trainerKey, id, archived: true })
    const joined = await call(classes, { action: 'join', classCode: a.classInfo.classCode })
    expect(joined.body.scenarios).toHaveLength(0)
  })
})
