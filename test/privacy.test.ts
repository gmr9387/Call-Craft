import postgres from 'postgres'
import { afterAll, describe, expect, it } from 'vitest'
import { GET as status, POST as auth } from '../api/auth.ts'
import { POST as admin } from '../api/admin.ts'
import { POST as coach } from '../api/coach.ts'
import { POST as people } from '../api/people.ts'
import { agentTurn, Browser, hasDb, PASSWORD, type Browser as B } from './helpers.ts'
import { admin as adminBrowser, agent, newClass, trainer } from './people.ts'

const sql = hasDb ? postgres(process.env.TEST_DATABASE_URL!, { max: 1 }) : null
afterAll(async () => {
  await sql?.end()
})

const idOf = async (b: B) => (await b.get(status)).body.user.id as string
const score = { action: 'score', scenarioId: 'cooperative', transcript: agentTurn(), startedAt: new Date().toISOString(), durationSec: 30 }

describe.skipIf(!hasDb)('privacy and the activity log (database)', () => {
  it("deletes a person and all their calls when an admin confirms with their email", async () => {
    const a = await adminBrowser()
    const t = await trainer()
    const sam = await agent((await newClass(t)).classCode)
    const samId = await idOf(sam)
    await sam.post(coach, score)
    await sam.post(coach, score)

    expect((await t.post(people, { action: 'delete', userId: samId, confirmEmail: sam.email })).status).toBe(403)
    expect((await a.post(people, { action: 'delete', userId: samId, confirmEmail: 'wrong@example.com' })).status).toBe(400)
    expect((await a.post(people, { action: 'delete', userId: await idOf(a), confirmEmail: 'x' })).status).toBe(400)
    const res = await a.post(people, { action: 'delete', userId: samId, confirmEmail: sam.email.toUpperCase() })
    expect(res.body).toEqual({ ok: true, calls: 2 })

    const [{ count }] = await sql!`select count(*)::int as count from attempts where user_id = ${samId}`
    expect(count).toBe(0)
    expect((await sam.get(status)).body.user).toBeNull()
    expect((await new Browser().post(auth, { action: 'login', email: sam.email, password: PASSWORD })).status).toBe(401)
  })

  it('deletes calls older than the retention period', async () => {
    const a = await adminBrowser()
    const sam = await agent((await newClass(await trainer())).classCode)
    const oldId = (await sam.post(coach, score)).body.attemptId
    const newId = (await sam.post(coach, score)).body.attemptId
    await sql!`update attempts set created_at = now() - interval '100 days' where id = ${oldId}`

    expect((await a.post(admin, { action: 'retention', days: 5 })).status).toBe(400)
    const res = await a.post(admin, { action: 'retention', days: 90 })
    expect(res.body).toMatchObject({ retentionDays: 90, deleted: 1 })
    const left = await sql!`select id from attempts where id in (${oldId}, ${newId})`
    expect(left.map((r) => r.id)).toEqual([newId])
    expect((await a.post(admin, { action: 'status' })).body.retentionDays).toBe(90)
    await a.post(admin, { action: 'retention', days: 0 })
  })

  it('records who did what, for admins only', async () => {
    const a = await adminBrowser()
    const t = await trainer()
    const cls = await newClass(t, 'Logged class')
    await t.post((await import('../api/classes.ts')).POST, { action: 'update', classId: cls.id, name: 'Logged class 2' })

    expect((await t.post(admin, { action: 'status' })).status).toBe(403)
    const log = (await a.post(admin, { action: 'status' })).body.activity as { actor: string; action: string; target: string }[]
    expect(log[0]).toMatchObject({ actor: 'Terry Trainer', action: 'Changed class', target: 'Logged class: renamed to Logged class 2' })
    expect(log.map((e) => e.action)).toEqual(expect.arrayContaining(['Created class', 'Accepted invite', 'Made invite link', 'Set up CallCraft']))
  })
})
