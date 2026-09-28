import { describe, expect, it } from 'vitest'
import { POST as coach } from '../api/coach.ts'
import { GET as health } from '../api/health.ts'
import { agentTurn, call, fake, get, withEnv } from './helpers.ts'

describe('practice calls', () => {
  it('returns the prospect reply', async () => {
    const res = await call(coach, { action: 'reply', scenarioId: 'cooperative', transcript: agentTurn() })
    expect(res.status).toBe(200)
    expect(res.body.text).toBe('Hi, this is Jordan.')
  })

  it('scores a call without a class', async () => {
    const res = await call(coach, { action: 'score', scenarioId: 'cooperative', transcript: agentTurn() })
    expect(res.status).toBe(200)
    expect(res.body.scorecard.overall_score).toBe(86)
    expect(res.body.saved).toBe(false)
  })

  it('rejects unknown scenarios and bad transcripts', async () => {
    expect((await call(coach, { action: 'reply', scenarioId: 'nope', transcript: agentTurn() })).status).toBe(400)
    expect((await call(coach, { action: 'reply', scenarioId: 'cooperative', transcript: 'x' })).status).toBe(400)
    const tooLong = Array.from({ length: 81 }, () => ({ speaker: 'agent', text: 'hi' }))
    expect((await call(coach, { action: 'reply', scenarioId: 'cooperative', transcript: tooLong })).status).toBe(400)
  })

  it('makes the trainer-built scenario require its class code', async () => {
    const res = await call(coach, {
      action: 'reply',
      scenarioId: '00000000-0000-4000-8000-000000000000',
      transcript: agentTurn(),
    })
    expect(res.status).toBe(400)
  })
})

describe('AI errors are explained, not hidden', () => {
  it('shows a low credit balance', async () => {
    fake().setMode('credit')
    const res = await call(coach, { action: 'reply', scenarioId: 'cooperative', transcript: agentTurn() })
    expect(res.status).toBe(502)
    expect(res.body.error).toMatch(/credit balance is too low/)
  })

  it('shows a rejected key', async () => {
    fake().setMode('badkey')
    const res = await call(coach, { action: 'reply', scenarioId: 'cooperative', transcript: agentTurn() })
    expect(res.body.error).toMatch(/key was rejected/)
  })

  it('shows a missing key', async () => {
    await withEnv({ ANTHROPIC_API_KEY: undefined }, async () => {
      const res = await call(coach, { action: 'reply', scenarioId: 'cooperative', transcript: agentTurn() })
      expect(res.status).toBe(422)
      expect(res.body.error).toMatch(/ANTHROPIC_API_KEY/)
    })
  })

  it('accepts the key under a lowercase name', async () => {
    await withEnv({ ANTHROPIC_API_KEY: undefined, anthropic_api_key: 'test-key' }, async () => {
      const res = await call(coach, { action: 'reply', scenarioId: 'cooperative', transcript: agentTurn() })
      expect(res.status).toBe(200)
    })
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

describe('model settings sent to Anthropic', () => {
  it('sends Haiku no effort setting and no fallback beta', async () => {
    await call(coach, { action: 'reply', scenarioId: 'cooperative', transcript: agentTurn() })
    await call(coach, { action: 'score', scenarioId: 'cooperative', transcript: agentTurn() })
    const [reply, score] = fake().requests
    expect(reply.model).toBe('claude-haiku-4-5')
    expect(reply.body.output_config).toBeUndefined()
    expect(reply.body.fallbacks).toBeUndefined()
    expect(score.body.output_config).toMatchObject({ format: expect.anything() })
    expect((score.body.output_config as Record<string, unknown>).effort).toBeUndefined()
  })
})
