import { beforeAll, describe, expect, it } from 'vitest'
import { POST as auth } from '../api/auth.ts'
import { POST as coach } from '../api/coach.ts'
import { GET as health } from '../api/health.ts'
import { agentTurn, Browser, fake, get, hasDb, newIp, PASSWORD, withEnv } from './helpers.ts'
import { agent, newClass, trainer } from './people.ts'

const reply = { action: 'reply', scenarioId: 'cooperative', transcript: agentTurn() }

describe.skipIf(!hasDb)('spending limits (database)', () => {
  let classCode: string

  beforeAll(async () => {
    classCode = (await newClass(await trainer())).classCode
  })

  it('limits AI requests per person, even from one shared office IP', async () => {
    await withEnv({ CALLCRAFT_HOURLY_CLIENT_LIMIT: '2' }, async () => {
      const a = await agent(classCode, 'Agent A')
      expect((await a.post(coach, reply)).status).toBe(200)
      expect((await a.post(coach, reply)).status).toBe(200)
      const blocked = await a.post(coach, reply)
      expect(blocked.status).toBe(429)
      expect(blocked.body.error).toMatch(/little fast/)

      // Someone else at the same IP address is not affected.
      const b = await agent(classCode, 'Agent B', a.ip)
      expect((await b.post(coach, reply)).status).toBe(200)
    })
  })

  it('stops all AI requests at the daily budget, before calling Anthropic', async () => {
    const a = await agent(classCode)
    await withEnv({ CALLCRAFT_DAILY_AI_LIMIT: '0' }, async () => {
      const res = await a.post(coach, reply)
      expect(res.status).toBe(429)
      expect(res.body.error).toMatch(/today's practice limit/)
      expect(fake().requests).toHaveLength(0)
    })
  })

  it('locks one account after repeated wrong passwords, even from many computers', async () => {
    const sam = await agent(classCode, 'Sam Target')
    await withEnv({ CALLCRAFT_HOURLY_SIGNIN_FAILURES: '2' }, async () => {
      const wrong = { action: 'login', email: sam.email, password: 'wrong password' }
      expect((await new Browser().post(auth, wrong)).status).toBe(401)
      expect((await new Browser().post(auth, wrong)).status).toBe(401)
      const blocked = await new Browser().post(auth, { ...wrong, password: PASSWORD })
      expect(blocked.status).toBe(429)
      expect(blocked.body.error).toMatch(/wrong passwords for this account/)
    })
  })

  it('slows down repeated wrong passwords from one computer', async () => {
    await withEnv({ CALLCRAFT_HOURLY_SIGNIN_FAILURES: '2' }, async () => {
      const b = new Browser()
      const wrong = { action: 'login', email: 'nobody@example.com', password: 'wrong password' }
      expect((await b.post(auth, wrong)).status).toBe(401)
      expect((await b.post(auth, wrong)).status).toBe(401)
      const blocked = await b.post(auth, wrong)
      expect(blocked.status).toBe(429)
      expect(blocked.body.error).toMatch(/Too many tries/)
    })
  })
})

describe('health check limits', () => {
  it('limits health-check pings', async () => {
    await withEnv({ CALLCRAFT_HOURLY_HEALTH_LIMIT: '1' }, async () => {
      const ip = newIp()
      expect((await get(health, ip)).body.ai.ok).toBe(true)
      const second = await get(health, ip)
      expect(second.body.ai.ok).toBe(false)
      expect(second.body.ai.detail).toMatch(/Too many health checks/)
    })
  })
})
