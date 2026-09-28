import { beforeAll, describe, expect, it } from 'vitest'
import { GET as calls } from '../api/calls.ts'
import { POST as coach } from '../api/coach.ts'
import { GET as health } from '../api/health.ts'
import { agentTurn, call, fake, get, hasDb, withEnv, type Browser } from './helpers.ts'
import { agent, newClass, trainer } from './people.ts'

const reply = { action: 'reply', scenarioId: 'cooperative', transcript: agentTurn() }
const score = (extra: Record<string, unknown> = {}) => ({
  action: 'score',
  scenarioId: 'cooperative',
  transcript: agentTurn(),
  startedAt: new Date().toISOString(),
  durationSec: 60,
  ...extra,
})

it('needs a signed-in person before any AI request', async () => {
  const res = await call(coach, reply)
  expect(res.status).toBe(401)
  expect(fake().requests).toHaveLength(0)
})

describe.skipIf(!hasDb)('practice calls (database)', () => {
  let sam: Browser

  beforeAll(async () => {
    const t = await trainer()
    sam = await agent((await newClass(t)).classCode)
  })

  it('returns the prospect reply', async () => {
    const res = await sam.post(coach, reply)
    expect(res.status).toBe(200)
    expect(res.body.text).toBe('Hi, this is Jordan.')
  })

  it("scores a call and saves it to the agent's calls and class", async () => {
    const res = await sam.post(coach, score())
    expect(res.status).toBe(200)
    expect(res.body.scorecard.overall_score).toBe(86)
    expect(res.body.saved).toBe(true)
    expect(res.body.className).toMatch(/^Class/)

    const mine = await sam.get(calls)
    expect(mine.body.attempts[0]).toMatchObject({ id: res.body.attemptId, agentName: 'Sam Lee' })
  })

  it('does not save preview calls', async () => {
    const res = await sam.post(coach, score({ save: false }))
    expect(res.body.saved).toBe(false)
  })

  it('rejects unknown scenarios and bad transcripts', async () => {
    expect((await sam.post(coach, { ...reply, scenarioId: 'nope' })).status).toBe(400)
    expect((await sam.post(coach, { ...reply, transcript: 'x' })).status).toBe(400)
    const tooLong = Array.from({ length: 81 }, () => ({ speaker: 'agent', text: 'hi' }))
    expect((await sam.post(coach, { ...reply, transcript: tooLong })).status).toBe(400)
    expect((await sam.post(coach, { ...reply, scenarioId: '00000000-0000-4000-8000-000000000000' })).status).toBe(400)
  })

  describe('AI errors are explained, not hidden', () => {
    it('shows a low credit balance', async () => {
      fake().setMode('credit')
      const res = await sam.post(coach, reply)
      expect(res.status).toBe(502)
      expect(res.body.error).toMatch(/credit balance is too low/)
    })

    it('shows a rejected key', async () => {
      fake().setMode('badkey')
      expect((await sam.post(coach, reply)).body.error).toMatch(/key was rejected/)
    })

    it('shows a missing key', async () => {
      await withEnv({ ANTHROPIC_API_KEY: undefined }, async () => {
        const res = await sam.post(coach, reply)
        expect(res.status).toBe(422)
        expect(res.body.error).toMatch(/ANTHROPIC_API_KEY/)
      })
    })

    it('accepts the key under a lowercase name', async () => {
      await withEnv({ ANTHROPIC_API_KEY: undefined, anthropic_api_key: 'test-key' }, async () => {
        expect((await sam.post(coach, reply)).status).toBe(200)
      })
    })
  })

  it('sends Haiku no effort setting and no fallback beta', async () => {
    await sam.post(coach, reply)
    await sam.post(coach, score({ save: false }))
    const [first, second] = fake().requests
    expect(first.model).toBe('claude-haiku-4-5')
    expect(first.body.output_config).toBeUndefined()
    expect(first.body.fallbacks).toBeUndefined()
    expect(second.body.output_config).toMatchObject({ format: expect.anything() })
    expect((second.body.output_config as Record<string, unknown>).effort).toBeUndefined()
  })
})

describe('health check', () => {
  it('reports the AI as working', async () => {
    const res = await get(health)
    expect(res.body.ai.ok).toBe(true)
    expect(res.body.ai.detail).toMatch(/claude-haiku-4-5/)
  })

  it('reports Anthropic errors', async () => {
    fake().setMode('credit')
    const res = await get(health)
    expect(res.body.ai.ok).toBe(false)
    expect(res.body.ai.detail).toMatch(/credit balance/)
  })
})
