import { describe, expect, it } from 'vitest'
import { POST as classes } from '../api/classes.ts'
import { POST as coach } from '../api/coach.ts'
import { POST as flows } from '../api/flows.ts'
import { POST as scenarios } from '../api/scenarios.ts'
import { agentTurn, hasDb, withEnv } from './helpers.ts'
import { agent, newClass, trainer } from './people.ts'

const flowInput = {
  name: 'Warranty renewal call',
  company: 'Northwind Home Services',
  purpose: 'Offer a renewal to customers whose warranty ends soon.',
  endGoal: 'The customer renews or books a callback',
  steps: [
    { label: 'Greeting', guide: 'Say who you are.' },
    { label: 'Offer', guide: 'Explain the renewal.' },
  ],
  rules: [],
}

describe.skipIf(!hasDb)('scenario builder (database)', () => {
  it('drafts only for trainers and admins, on a real call flow', async () => {
    const t = await trainer()
    const sam = await agent((await newClass(t)).classCode)
    const draft = { action: 'draft', flowId: 'builtin', description: 'Wants night classes' }

    expect((await sam.post(scenarios, draft)).status).toBe(403)
    expect((await t.post(scenarios, { ...draft, flowId: '00000000-0000-4000-8000-000000000000' })).status).toBe(404)
    const res = await t.post(scenarios, draft)
    expect(res.status).toBe(200)
    expect(res.body.draft.title).toBe('Night classes only')
  })

  it('limits drafts per call flow per day', async () => {
    const t = await trainer()
    const flow = (await t.post(flows, { action: 'create', flow: flowInput })).body.flow
    await withEnv({ CALLCRAFT_DAILY_DRAFT_LIMIT: '1' }, async () => {
      expect((await t.post(scenarios, { action: 'draft', flowId: flow.id, description: 'a' })).status).toBe(200)
      const blocked = await t.post(scenarios, { action: 'draft', flowId: flow.id, description: 'b' })
      expect(blocked.status).toBe(429)
    })
  })

  it('shares scenarios with every class on the call flow, and only those classes', async () => {
    const t = await trainer()
    const other = await trainer('Other Trainer')
    const flow = (await t.post(flows, { action: 'create', flow: flowInput })).body.flow
    const oldCohort = (await t.post(classes, { action: 'create', name: 'September', flowId: flow.id })).body.classInfo
    const sampleClass = await newClass(t, 'On the sample flow')
    const inOld = await agent(oldCohort.classCode, 'In September')
    const onSample = await agent(sampleClass.classCode, 'On sample')

    const { body: drafted } = await t.post(scenarios, { action: 'draft', flowId: flow.id, description: 'x' })
    const create = (scenario: unknown) => t.post(scenarios, { action: 'create', flowId: flow.id, scenario })
    expect((await create({ ...drafted.draft, persona: 'short' })).status).toBe(400)
    const id = (await create(drafted.draft)).body.scenario.id

    // A class made later on the same flow gets it too; a class on another flow doesn't.
    const newCohort = (await t.post(classes, { action: 'create', name: 'October', flowId: flow.id })).body.classInfo
    const inNew = await agent(newCohort.classCode, 'In October')
    expect((await inNew.post(classes, { action: 'mine' })).body.joined.scenarios.map((s: { id: string }) => s.id)).toEqual([id])
    expect((await onSample.post(classes, { action: 'mine' })).body.joined.scenarios).toHaveLength(0)

    const reply = { action: 'reply', scenarioId: id, transcript: agentTurn() }
    expect((await inOld.post(coach, reply)).status).toBe(200)
    expect((await onSample.post(coach, reply)).status).toBe(400)
    expect((await other.post(coach, reply)).status).toBe(200) // trainers share call flows

    // Editing on the wrong flow fails; on the right flow any trainer can edit.
    const update = { action: 'update', flowId: 'builtin', id, scenario: { ...drafted.draft, title: 'Renamed' } }
    expect((await t.post(scenarios, update)).status).toBe(404)
    expect((await other.post(scenarios, { ...update, flowId: flow.id })).body.scenario.title).toBe('Renamed')

    await t.post(scenarios, { action: 'archive', flowId: flow.id, id, archived: true })
    expect((await inOld.post(classes, { action: 'mine' })).body.joined.scenarios).toHaveLength(0)
  })
})
