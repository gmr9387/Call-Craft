import { describe, expect, it } from 'vitest'
import { GET as status, POST as auth } from '../api/auth.ts'
import { GET as calls } from '../api/calls.ts'
import { POST as people } from '../api/people.ts'
import { Browser, hasDb, PASSWORD, uniqueEmail } from './helpers.ts'
import { admin, agent, newClass, trainer } from './people.ts'

describe.skipIf(!hasDb)('accounts (database)', () => {
  it('makes the first account the admin, only once', async () => {
    const before = await new Browser().get(status)
    expect(before.body).toEqual({ user: null, needsSetup: true })

    const a = await admin()
    const me = await a.get(status)
    expect(me.body.user).toMatchObject({ name: 'Ada Admin', role: 'admin' })

    const again = await new Browser().post(auth, {
      action: 'setup',
      name: 'Someone Else',
      email: uniqueEmail('late'),
      password: PASSWORD,
    })
    expect(again.status).toBe(409)
    expect((await new Browser().get(status)).body.needsSetup).toBe(false)
  })

  it('signs in and out with email and password', async () => {
    const t = await trainer()
    const cls = await newClass(t)
    const sam = await agent(cls.classCode)

    const b = new Browser()
    expect((await b.post(auth, { action: 'login', email: sam.email, password: 'wrong password' })).status).toBe(401)
    const ok = await b.post(auth, { action: 'login', email: sam.email.toUpperCase(), password: PASSWORD })
    expect(ok.status).toBe(200)
    expect(ok.cookie).toMatch(/HttpOnly; SameSite=Lax/)
    expect(ok.body.user).toMatchObject({ role: 'agent', classInfo: { classCode: cls.classCode } })

    await b.post(auth, { action: 'logout' })
    expect((await b.get(status)).body.user).toBeNull()
    expect((await b.get(calls)).status).toBe(401)
  })

  it('refuses requests that are not JSON (blocks cross-site form posts)', async () => {
    const res = await auth(
      new Request('http://localhost/api', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: JSON.stringify({ action: 'logout' }),
      }),
    )
    expect(res.status).toBe(400)
  })

  it('lets agents sign up only with a real class code and a unique email', async () => {
    const cls = await newClass(await trainer())
    const signup = (extra: Record<string, unknown>) =>
      new Browser().post(auth, {
        action: 'signup',
        classCode: cls.classCode.toLowerCase(),
        name: 'Pat Doe',
        email: uniqueEmail('pat'),
        password: PASSWORD,
        ...extra,
      })
    expect((await signup({ classCode: 'ZZZZZZ' })).status).toBe(404)
    expect((await signup({ password: 'short' })).body.error).toMatch(/at least 8/)
    expect((await signup({ email: 'not-an-email' })).status).toBe(400)
    const email = uniqueEmail('pat')
    expect((await signup({ email })).status).toBe(200)
    expect((await signup({ email })).body.error).toMatch(/already exists/)
  })

  it('invites trainers with one-time links that only admins can make', async () => {
    const a = await admin()
    const t = await trainer()
    const cls = await newClass(t)
    const sam = await agent(cls.classCode)
    expect((await t.post(people, { action: 'invite', role: 'trainer' })).status).toBe(403)
    expect((await sam.post(people, { action: 'list' })).status).toBe(403)

    const { token } = (await a.post(people, { action: 'invite', role: 'trainer' })).body
    const info = await new Browser().post(auth, { action: 'link', token })
    expect(info.body.link).toMatchObject({ kind: 'invite', role: 'trainer' })

    const fields = { action: 'accept', token, name: 'Tess', password: PASSWORD }
    expect((await new Browser().post(auth, { ...fields, email: uniqueEmail('tess') })).status).toBe(200)
    const reused = await new Browser().post(auth, { ...fields, email: uniqueEmail('tess2') })
    expect(reused.body.error).toMatch(/expired or was already used/)
  })

  it("resets passwords with a link from the agent's trainer or an admin", async () => {
    const a = await admin()
    const t1 = await trainer('Trainer One')
    const t2 = await trainer('Trainer Two')
    const sam = await agent((await newClass(t1)).classCode)
    const samId = (await sam.get(status)).body.user.id
    const t1Id = (await t1.get(status)).body.user.id

    expect((await t2.post(people, { action: 'reset-link', userId: samId })).status).toBe(403)
    expect((await t1.post(people, { action: 'reset-link', userId: t1Id })).status).toBe(403)
    expect((await a.post(people, { action: 'reset-link', userId: 'not-an-id' })).status).toBe(404)

    const { token } = (await t1.post(people, { action: 'reset-link', userId: samId })).body
    const info = await new Browser().post(auth, { action: 'link', token })
    expect(info.body.link).toMatchObject({ kind: 'reset', name: 'Sam Lee', email: sam.email })

    const reset = await new Browser().post(auth, { action: 'reset', token, password: 'a brand new password' })
    expect(reset.status).toBe(200)
    // Old browsers are signed out, and only the new password works.
    expect((await sam.get(calls)).status).toBe(401)
    expect((await new Browser().post(auth, { action: 'login', email: sam.email, password: PASSWORD })).status).toBe(401)
    const login = await new Browser().post(auth, { action: 'login', email: sam.email, password: 'a brand new password' })
    expect(login.status).toBe(200)
  })

  it('lets admins turn accounts off and on, but not their own', async () => {
    const a = await admin()
    const sam = await agent((await newClass(await trainer())).classCode)
    const samId = (await sam.get(status)).body.user.id
    const adminId = (await a.get(status)).body.user.id

    expect((await a.post(people, { action: 'disable', userId: adminId, disabled: true })).status).toBe(400)
    expect((await a.post(people, { action: 'disable', userId: samId, disabled: true })).status).toBe(200)
    expect((await sam.get(calls)).status).toBe(401)
    const login = { action: 'login', email: sam.email, password: PASSWORD }
    expect((await new Browser().post(auth, login)).status).toBe(401)

    await a.post(people, { action: 'disable', userId: samId, disabled: false })
    expect((await new Browser().post(auth, login)).status).toBe(200)

    const list = await a.post(people, { action: 'list' })
    expect(list.body.people.find((p: { id: string }) => p.id === samId)).toMatchObject({ role: 'agent', disabled: false })
  })

  it('changes your own password', async () => {
    const sam = await agent((await newClass(await trainer())).classCode)
    const change = (current: string) =>
      sam.post(auth, { action: 'password', currentPassword: current, newPassword: 'another good password' })
    expect((await change('wrong password')).status).toBe(400)
    expect((await change(PASSWORD)).status).toBe(200)
    const login = await new Browser().post(auth, { action: 'login', email: sam.email, password: 'another good password' })
    expect(login.status).toBe(200)
  })
})
