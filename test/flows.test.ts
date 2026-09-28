import { describe, expect, it } from 'vitest'
import { POST as classes } from '../api/classes.ts'
import { POST as coach } from '../api/coach.ts'
import { POST as flows } from '../api/flows.ts'
import { POST as scenarios } from '../api/scenarios.ts'
import { agentTurn, fake, hasDb } from './helpers.ts'
import { agent, newClass, trainer } from './people.ts'

const flowInput = {
  name: 'Appointment reminder call',
  company: 'Brightside Dental',
  purpose: "Call patients to confirm tomorrow's appointment.",
  endGoal: 'The patient confirms or reschedules',
  steps: [
    { label: 'Greeting', guide: 'Say your name and the office name.' },
    { label: 'Confirm time', guide: 'Read the appointment time and ask if it works.' },
  ],
  rules: ['Never share appointment details with anyone but the patient.'],
}

describe.skipIf(!hasDb)('call flows (database)', () => {
  it('lets trainers draft, save, edit, and archive call flows', async () => {
    const t = await trainer()
    const drafted = await t.post(flows, { action: 'draft', description: 'We call dental patients to confirm appointments.' })
    expect(drafted.status).toBe(200)
    expect(drafted.body.draft.company).toBe('Brightside Dental')

    expect((await t.post(flows, { action: 'create', flow: { ...flowInput, steps: [flowInput.steps[0]] } })).status).toBe(400)
    const created = await t.post(flows, { action: 'create', flow: flowInput })
    expect(created.status).toBe(200)
    const flow = created.body.flow
    expect(flow.steps.map((s: { id: string }) => s.id)).toHaveLength(2)

    // Editing keeps existing step ids and gives new steps new ones.
    const steps = [...flow.steps, { label: 'Wrap up', guide: 'Thank them.' }]
    const updated = await t.post(flows, { action: 'update', id: flow.id, flow: { ...flowInput, steps } })
    expect(updated.body.flow.steps[0].id).toBe(flow.steps[0].id)
    expect(updated.body.flow.steps[2].id).toMatch(/^step_/)

    const list = (await t.post(flows, { action: 'list' })).body.flows
    expect(list[0]).toMatchObject({ id: 'builtin', builtIn: true })
    expect(list.map((f: { id: string }) => f.id)).toContain(flow.id)

    await t.post(flows, { action: 'archive', id: flow.id, archived: true })
    const archivedPick = await t.post(classes, { action: 'create', name: 'X', flowId: flow.id })
    expect(archivedPick.body.error).toMatch(/call flow wasn't found/)
  })

  it('keeps call flows away from agents', async () => {
    const sam = await agent((await newClass(await trainer())).classCode)
    expect((await sam.post(flows, { action: 'list' })).status).toBe(403)
  })

  it("uses the class's call flow for replies, scoring, and scenario drafts", async () => {
    const t = await trainer()
    const flow = (await t.post(flows, { action: 'create', flow: flowInput })).body.flow
    const cls = (await t.post(classes, { action: 'create', name: 'Dental reminders', flowId: flow.id })).body.classInfo
    const sam = await agent(cls.classCode)

    const joined = (await sam.post(classes, { action: 'mine' })).body.joined
    expect(joined.flow).toMatchObject({ id: flow.id, company: 'Brightside Dental' })

    const { body: drafted } = await t.post(scenarios, { action: 'draft', flowId: flow.id, description: 'Nervous patient' })
    expect(fake().requests.at(-1)!.body.messages[0].content).toContain('Brightside Dental')

    // Skipped steps are limited to steps in this flow.
    const scenario = { ...drafted.draft, notApplicable: [flow.steps[1].id, 'qualify_military'] }
    const created = (await t.post(scenarios, { action: 'create', flowId: flow.id, scenario })).body.scenario
    expect(created.notApplicable).toEqual([flow.steps[1].id])

    fake().requests.length = 0
    const transcript = agentTurn('Hi, this is Sam from Brightside Dental.')
    await sam.post(coach, { action: 'reply', scenarioId: created.id, transcript })
    expect(JSON.stringify(fake().requests[0].body.system)).toContain('Brightside Dental')
    await sam.post(coach, {
      action: 'score',
      scenarioId: created.id,
      transcript,
      startedAt: new Date().toISOString(),
      durationSec: 30,
    })
    const scoring = fake().requests[1].body.messages[0].content as string
    expect(scoring).toContain('Confirm time')
    expect(scoring).toContain('Never share appointment details')
    expect(scoring).not.toContain('Lakeview')

    // Switching the class back to the sample flow changes what the dashboard reports.
    await t.post(classes, { action: 'update', classId: cls.id, flowId: 'builtin' })
    const dash = (await t.post(classes, { action: 'dashboard', classId: cls.id })).body
    expect(dash.flow.id).toBe('builtin')
  })
})
