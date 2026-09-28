import { describe, expect, it } from 'vitest'
import { POST as coach } from '../api/coach.ts'
import { GET as health } from '../api/health.ts'
import { agentTurn, call, fake, get, newIp, withEnv } from './helpers.ts'

const reply = { action: 'reply', scenarioId: 'cooperative', transcript: agentTurn() }

describe('spending limits', () => {
  it('limits AI requests from one computer per hour', async () => {
    await withEnv({ CALLCRAFT_HOURLY_CLIENT_LIMIT: '2' }, async () => {
      const ip = newIp()
      expect((await call(coach, reply, ip)).status).toBe(200)
      expect((await call(coach, reply, ip)).status).toBe(200)
      const blocked = await call(coach, reply, ip)
      expect(blocked.status).toBe(429)
      expect(blocked.body.error).toMatch(/little fast/)
      // A different computer is not affected.
      expect((await call(coach, reply, newIp())).status).toBe(200)
    })
  })

  it('stops all AI requests at the daily budget, before calling Anthropic', async () => {
    await withEnv({ CALLCRAFT_DAILY_AI_LIMIT: '0' }, async () => {
      const res = await call(coach, reply)
      expect(res.status).toBe(429)
      expect(res.body.error).toMatch(/today's practice limit/)
      expect(fake().requests).toHaveLength(0)
    })
  })

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
