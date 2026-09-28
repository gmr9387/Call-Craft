import { describe, expect, it } from 'vitest'
import { GET as status } from '../api/auth.ts'
import { GET as calls } from '../api/calls.ts'
import { POST as classes } from '../api/classes.ts'
import { POST as coach } from '../api/coach.ts'
import { agentTurn, fake, hasDb, type Browser } from './helpers.ts'
import { admin, agent, newClass, trainer } from './people.ts'

const score = (scenarioId: string) => ({
  action: 'score',
  scenarioId,
  transcript: agentTurn(),
  startedAt: new Date().toISOString(),
  durationSec: 60,
})

const idOf = async (b: Browser) => (await b.get(status)).body.user.id as string

describe.skipIf(!hasDb)('ready for live calls (database)', () => {
  it('tracks which required scenarios each agent has passed', async () => {
    const t = await trainer()
    const cls = await newClass(t)
    const sam = await agent(cls.classCode, 'Sam Lee')
    const samId = await idOf(sam)
    const update = (extra: Record<string, unknown>) => t.post(classes, { action: 'update', classId: cls.id, ...extra })

    expect((await update({ requiredScenarios: ['nope'], passScore: 80 })).status).toBe(400)
    expect((await update({ requiredScenarios: ['cooperative'], passScore: 101 })).status).toBe(400)
    expect((await update({ requiredScenarios: ['cooperative', 'do-not-call'], passScore: 80 })).status).toBe(200)

    // The fake AI scores 86 / pass.
    await sam.post(coach, score('cooperative'))
    let dash = (await t.post(classes, { action: 'dashboard', classId: cls.id })).body
    expect(dash.requirements).toEqual({ scenarioIds: ['cooperative', 'do-not-call'], passScore: 80 })
    expect(dash.passed[samId]).toEqual(['cooperative'])
    expect((await sam.post(classes, { action: 'mine' })).body.joined.passed).toEqual(['cooperative'])

    // A pass below the class's passing score doesn't count.
    await update({ requiredScenarios: ['cooperative', 'do-not-call'], passScore: 90 })
    dash = (await t.post(classes, { action: 'dashboard', classId: cls.id })).body
    expect(dash.passed[samId]).toBeUndefined()
  })

  it("lets trainers review a call: a note, a corrected score, and it counts toward readiness", async () => {
    const t = await trainer()
    const other = await trainer('Other Trainer')
    const cls = await newClass(t)
    const sam = await agent(cls.classCode)
    const samId = await idOf(sam)
    await t.post(classes, { action: 'update', classId: cls.id, requiredScenarios: ['cooperative'], passScore: 90 })

    const attemptId = (await sam.post(coach, score('cooperative'))).body.attemptId
    const review = (extra: Record<string, unknown>, who = t) => who.post(classes, { action: 'review', attemptId, ...extra })

    expect((await review({ note: 'x' }, other)).status).toBe(404)
    expect((await review({ note: 'x' }, sam)).status).toBe(403)
    expect((await review({ score: 120 })).status).toBe(400)
    const saved = await review({ note: 'Great open. Slow down on the disclosure.', score: 92, result: 'pass' })
    expect(saved.body.attempt.review).toMatchObject({ note: 'Great open. Slow down on the disclosure.', score: 92, by: 'Terry Trainer' })

    // The agent sees the note; the corrected score makes them ready.
    const mine = (await sam.get(calls)).body.attempts[0]
    expect(mine.review.note).toMatch(/Great open/)
    const dash = (await t.post(classes, { action: 'dashboard', classId: cls.id })).body
    expect(dash.passed[samId]).toEqual(['cooperative'])

    // Clearing the review removes it.
    const cleared = await review({ note: '', score: null, result: null })
    expect(cleared.body.attempt.review).toBeUndefined()
  })

  it("only lets admins review calls made outside a class", async () => {
    const a = await admin()
    const t = await trainer()
    const attemptId = (await t.post(coach, score('cooperative'))).body.attemptId
    expect((await t.post(classes, { action: 'review', attemptId, note: 'x' })).status).toBe(404)
    expect((await a.post(classes, { action: 'review', attemptId, note: 'x' })).status).toBe(200)
    expect(fake().requests.length).toBeGreaterThan(0)
  })
})
