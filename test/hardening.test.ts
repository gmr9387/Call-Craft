import { describe, expect, it } from 'vitest'
import { GET as status, POST as auth } from '../api/auth.ts'
import { POST as admin } from '../api/admin.ts'
import { POST as classes } from '../api/classes.ts'
import { POST as coach } from '../api/coach.ts'
import { POST as people } from '../api/people.ts'
import { agentTurn, Browser, hasDb, PASSWORD, type Browser as B } from './helpers.ts'
import { admin as adminBrowser, agent, newClass, trainer } from './people.ts'

const idOf = async (b: B) => (await b.get(status)).body.user.id as string
const score = {
  action: 'score',
  scenarioId: 'cooperative',
  transcript: agentTurn(),
  startedAt: new Date().toISOString(),
  durationSec: 30,
}

describe.skipIf(!hasDb)('hardening (database)', () => {
  it('sends class dashboards without conversations, and loads a call only for people allowed to see it', async () => {
    const t = await trainer()
    const other = await trainer('Other Trainer')
    const cls = await newClass(t)
    const sam = await agent(cls.classCode)
    const stranger = await agent((await newClass(other)).classCode, 'Stranger')
    const attemptId = (await sam.post(coach, score)).body.attemptId

    const listed = (await t.post(classes, { action: 'dashboard', classId: cls.id })).body.attempts[0]
    expect(listed).toMatchObject({ id: attemptId, partial: true, transcript: [] })

    const open = (who: B) => who.post(classes, { action: 'call', attemptId })
    expect((await open(t)).body.attempt.transcript).toHaveLength(1)
    expect((await open(sam)).status).toBe(200)
    expect((await open(other)).status).toBe(404)
    expect((await open(stranger)).status).toBe(404)
  })

  it('exports every call in a class for its trainer', async () => {
    const t = await trainer()
    const cls = await newClass(t)
    const sam = await agent(cls.classCode)
    await sam.post(coach, score)
    await sam.post(coach, score)
    expect((await sam.post(classes, { action: 'export', classId: cls.id })).status).toBe(404)
    const res = await t.post(classes, { action: 'export', classId: cls.id })
    expect(res.body.attempts).toHaveLength(2)
  })

  it('lets admins download everything, without passwords or sessions', async () => {
    const a = await adminBrowser()
    const t = await trainer()
    expect((await t.post(admin, { action: 'export' })).status).toBe(403)
    const res = await a.post(admin, { action: 'export' })
    expect(Object.keys(res.body)).toEqual(
      expect.arrayContaining(['exportedAt', 'people', 'classes', 'callFlows', 'scenarios', 'calls', 'activity']),
    )
    expect(JSON.stringify(res.body)).not.toMatch(/password_hash|scrypt\$|token_hash/)
  })

  it('lets admins change roles, but not their own', async () => {
    const a = await adminBrowser()
    const t = await trainer()
    const tId = await idOf(t)
    const role = (userId: string, r: string) => a.post(people, { action: 'role', userId, role: r })

    expect((await role(await idOf(a), 'trainer')).status).toBe(400)
    expect((await role(tId, 'owner')).status).toBe(400)
    expect((await t.post(people, { action: 'role', userId: tId, role: 'admin' })).status).toBe(403)
    expect((await role(tId, 'admin')).status).toBe(200)
    expect((await t.post(admin, { action: 'status' })).status).toBe(200) // takes effect right away
    await role(tId, 'trainer')
    expect((await t.post(admin, { action: 'status' })).status).toBe(403)
  })

  it('signs other browsers out when you change your password', async () => {
    const sam = await agent((await newClass(await trainer())).classCode)
    const otherBrowser = new Browser()
    await otherBrowser.post(auth, { action: 'login', email: sam.email, password: PASSWORD })
    expect((await otherBrowser.get(status)).body.user).not.toBeNull()

    await sam.post(auth, { action: 'password', currentPassword: PASSWORD, newPassword: 'a whole new password' })
    expect((await sam.get(status)).body.user).not.toBeNull()
    expect((await otherBrowser.get(status)).body.user).toBeNull()
  })
})
