import { describe, expect, it } from 'vitest'
import { GET as status } from '../api/auth.ts'
import { POST as classes } from '../api/classes.ts'
import { POST as coach } from '../api/coach.ts'
import { agentTurn, hasDb } from './helpers.ts'
import { admin, agent, newClass, trainer } from './people.ts'

const score = {
  action: 'score',
  scenarioId: 'cooperative',
  transcript: agentTurn(),
  startedAt: new Date().toISOString(),
  durationSec: 60,
}

describe.skipIf(!hasDb)('classes (database)', () => {
  it('shows trainers their own classes, and admins every class', async () => {
    const a = await admin()
    const t1 = await trainer('Trainer One')
    const t2 = await trainer('Trainer Two')
    const c1 = await newClass(t1, 'Group A')
    const c2 = await newClass(t2, 'Group B')

    const mine = (await t1.post(classes, { action: 'list' })).body.classes
    expect(mine.map((c: { id: string }) => c.id)).toEqual([c1.id])
    const all = (await a.post(classes, { action: 'list' })).body.classes.map((c: { id: string }) => c.id)
    expect(all).toEqual(expect.arrayContaining([c1.id, c2.id]))

    expect((await t2.post(classes, { action: 'dashboard', classId: c1.id })).status).toBe(404)
    expect((await a.post(classes, { action: 'dashboard', classId: c1.id })).status).toBe(200)
    expect((await t1.post(classes, { action: 'create', name: '' })).status).toBe(400)
  })

  it("puts agents' scored calls and the roster on the class dashboard", async () => {
    const t = await trainer()
    const cls = await newClass(t)
    const sam = await agent(cls.classCode, 'Sam Lee')
    await agent(cls.classCode, 'Alex Kim')
    expect((await sam.post(classes, { action: 'list' })).status).toBe(403)

    expect((await sam.post(coach, score)).body.saved).toBe(true)
    expect((await sam.post(coach, { ...score, save: false })).body.saved).toBe(false)
    // A trainer's own practice call is saved to them, not to a class.
    expect((await t.post(coach, score)).body.className).toBeNull()

    const dash = (await t.post(classes, { action: 'dashboard', classId: cls.id })).body
    expect(dash.attempts).toHaveLength(1)
    expect(dash.attempts[0]).toMatchObject({ agentName: 'Sam Lee', scenarioTitle: 'Ready to talk' })
    expect(dash.agents.map((a: { name: string }) => a.name)).toEqual(['Alex Kim', 'Sam Lee'])

    const listed = (await t.post(classes, { action: 'list' })).body.classes[0]
    expect(listed).toMatchObject({ agentCount: 2, callCount: 1 })
  })

  it('lets agents switch classes with a code, and trainers remove them', async () => {
    const t = await trainer()
    const first = await newClass(t, 'First')
    const second = await newClass(t, 'Second')
    const sam = await agent(first.classCode)
    const samId = (await sam.get(status)).body.user.id

    expect((await sam.post(classes, { action: 'join', classCode: 'ZZZZZZ' })).status).toBe(404)
    const joined = await sam.post(classes, { action: 'join', classCode: second.classCode.toLowerCase() })
    expect(joined.body.classInfo.id).toBe(second.id)
    expect((await sam.post(classes, { action: 'mine' })).body.joined.classInfo.name).toBe('Second')

    expect((await t.post(classes, { action: 'remove-agent', classId: first.id, userId: samId })).status).toBe(404)
    expect((await t.post(classes, { action: 'remove-agent', classId: second.id, userId: samId })).status).toBe(200)
    expect((await sam.post(classes, { action: 'mine' })).body.joined).toBeNull()
    // Still able to practice, just not saved to a class.
    expect((await sam.post(coach, score)).body).toMatchObject({ saved: true, className: null })
  })
})
