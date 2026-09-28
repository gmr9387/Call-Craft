import { describe, expect, it } from 'vitest'
import { GET as status, POST as auth } from '../api/auth.ts'
import { POST as admin } from '../api/admin.ts'
import { POST as classes } from '../api/classes.ts'
import { POST as coach } from '../api/coach.ts'
import { POST as people } from '../api/people.ts'
import { agentTurn, Browser, fake, hasDb, PASSWORD, uniqueEmail } from './helpers.ts'
import { admin as adminBrowser, agent, newClass, trainer } from './people.ts'

const idOf = async (b: Browser) => (await b.get(status)).body.user.id as string

describe.skipIf(!hasDb)('running classes without a developer (database)', () => {
  it('renames, archives, and restores classes; archived codes stop working', async () => {
    const t = await trainer()
    const cls = await newClass(t, 'Old name')
    expect((await t.post(classes, { action: 'update', classId: cls.id, name: 'New name' })).status).toBe(200)
    await t.post(classes, { action: 'update', classId: cls.id, archived: true })

    const list = (await t.post(classes, { action: 'list' })).body.classes
    expect(list[0]).toMatchObject({ name: 'New name', archived: true })
    const signup = { action: 'signup', classCode: cls.classCode, name: 'Late Larry', email: uniqueEmail('late'), password: PASSWORD }
    expect((await new Browser().post(auth, signup)).status).toBe(404)

    await t.post(classes, { action: 'update', classId: cls.id, archived: false })
    expect((await new Browser().post(auth, signup)).status).toBe(200)
  })

  it('moves agents between classes the trainer runs', async () => {
    const t = await trainer()
    const other = await trainer('Other Trainer')
    const a = await newClass(t, 'A')
    const b = await newClass(t, 'B')
    const theirs = await newClass(other, 'Theirs')
    const sam = await agent(a.classCode)
    const samId = await idOf(sam)

    const move = (to: string, from = a.id) => t.post(classes, { action: 'move-agent', classId: from, userId: samId, toClassId: to })
    expect((await move(theirs.id)).status).toBe(404)
    expect((await move(b.id)).status).toBe(200)
    expect((await sam.post(classes, { action: 'mine' })).body.joined.classInfo.name).toBe('B')
    expect((await move(a.id)).status).toBe(404) // no longer in class A
  })

  it('lets admins hand a class to another trainer', async () => {
    const a = await adminBrowser()
    const t1 = await trainer('First')
    const t2 = await trainer('Second')
    const cls = await newClass(t1)
    const sam = await agent(cls.classCode)

    expect((await t1.post(classes, { action: 'reassign', classId: cls.id, trainerId: await idOf(t2) })).status).toBe(403)
    expect((await a.post(classes, { action: 'reassign', classId: cls.id, trainerId: await idOf(sam) })).status).toBe(400)
    expect((await a.post(classes, { action: 'reassign', classId: cls.id, trainerId: await idOf(t2) })).status).toBe(200)
    expect((await t2.post(classes, { action: 'dashboard', classId: cls.id })).status).toBe(200)
    expect((await t1.post(classes, { action: 'dashboard', classId: cls.id })).status).toBe(404)
  })

  it("fixes names and emails, within each person's reach", async () => {
    const a = await adminBrowser()
    const t = await trainer()
    const other = await trainer('Other Trainer')
    const sam = await agent((await newClass(t)).classCode, 'Sam Typo')
    const samId = await idOf(sam)
    const email = uniqueEmail('sam.fixed')

    expect((await other.post(people, { action: 'update', userId: samId, name: 'X', email })).status).toBe(403)
    expect((await t.post(people, { action: 'update', userId: await idOf(other), name: 'X', email })).status).toBe(403)
    expect((await t.post(people, { action: 'update', userId: samId, name: 'Sam Lee', email: 'bad' })).status).toBe(400)
    expect((await t.post(people, { action: 'update', userId: samId, name: 'Sam Lee', email })).status).toBe(200)
    expect((await sam.get(status)).body.user).toMatchObject({ name: 'Sam Lee', email })

    const taken = await a.post(people, { action: 'update', userId: await idOf(t), name: 'T', email })
    expect(taken.body.error).toMatch(/already uses that email/)
  })
})

describe.skipIf(!hasDb)('system page (database)', () => {
  it('shows usage and lets admins change spending limits in the app', async () => {
    const a = await adminBrowser()
    const t = await trainer()
    const sam = await agent((await newClass(t)).classCode)
    await sam.post(coach, { action: 'reply', scenarioId: 'cooperative', transcript: agentTurn() })

    expect((await t.post(admin, { action: 'status' })).status).toBe(403)
    const before = (await a.post(admin, { action: 'status' })).body
    expect(before.usage.today.reply).toBeGreaterThanOrEqual(1)
    expect(before.usage.week).toHaveLength(7)
    expect(before.counts.agents).toBeGreaterThanOrEqual(1)
    expect(before.counts.classes).toBeGreaterThanOrEqual(1)
    expect(before.limits.dailyTotal).toBe(1500)

    expect((await a.post(admin, { action: 'limits', dailyTotal: -1, perClientHourly: 5, draftsPerClassDaily: 5 })).status).toBe(400)
    const saved = await a.post(admin, { action: 'limits', dailyTotal: 0, perClientHourly: 50, draftsPerClassDaily: 5 })
    expect(saved.body.limits.dailyTotal).toBe(0)
    const blocked = await sam.post(coach, { action: 'reply', scenarioId: 'cooperative', transcript: agentTurn() })
    expect(blocked.status).toBe(429)

    await a.post(admin, { action: 'limits', dailyTotal: 1500, perClientHourly: 120, draftsPerClassDaily: 25 })
    expect((await sam.post(coach, { action: 'reply', scenarioId: 'cooperative', transcript: agentTurn() })).status).toBe(200)
  })

  it('warns trainers and admins when the AI stops working, and clears once it works', async () => {
    const a = await adminBrowser()
    const t = await trainer()
    const sam = await agent((await newClass(t)).classCode)

    fake().setMode('credit')
    await sam.post(coach, { action: 'reply', scenarioId: 'cooperative', transcript: agentTurn() })
    expect((await t.get(status)).body.aiProblem).toMatch(/credit balance/)
    expect((await sam.get(status)).body.aiProblem).toBeNull()
    expect((await a.post(admin, { action: 'status' })).body.aiProblem.message).toMatch(/credit balance/)
    const check = await a.post(admin, { action: 'check-ai' })
    expect(check.body.ai.ok).toBe(false)

    fake().setMode('ok')
    await sam.post(coach, { action: 'reply', scenarioId: 'cooperative', transcript: agentTurn() })
    expect((await t.get(status)).body.aiProblem).toBeNull()
  })
})
