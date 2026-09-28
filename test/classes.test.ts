import { describe, expect, it } from 'vitest'
import { POST as classes } from '../api/classes.ts'
import { POST as coach } from '../api/coach.ts'
import { agentTurn, call, hasDb } from './helpers.ts'

async function newClass(name = `Test class ${Date.now()}`) {
  const res = await call(classes, { action: 'create', name })
  expect(res.status).toBe(200)
  return res.body as { classInfo: { classCode: string; name: string }; trainerKey: string }
}

const scoreBody = (classCode: string, extra: Record<string, unknown> = {}) => ({
  action: 'score',
  scenarioId: 'cooperative',
  transcript: agentTurn(),
  classCode,
  agentName: 'Sam Lee',
  startedAt: new Date().toISOString(),
  durationSec: 60,
  ...extra,
})

describe.skipIf(!hasDb)('classes (database)', () => {
  it('creates, joins (any letter case), and rejects unknown codes', async () => {
    const { classInfo } = await newClass()
    const joined = await call(classes, { action: 'join', classCode: classInfo.classCode.toLowerCase() })
    expect(joined.status).toBe(200)
    expect(joined.body.classInfo.classCode).toBe(classInfo.classCode)
    expect((await call(classes, { action: 'join', classCode: 'ZZZZZZ' })).status).toBe(404)
    expect((await call(classes, { action: 'create', name: '' })).status).toBe(400)
  })

  it('saves scored calls to the class and shows them on the dashboard', async () => {
    const { classInfo, trainerKey } = await newClass()
    const saved = await call(coach, scoreBody(classInfo.classCode))
    expect(saved.body.saved).toBe(true)

    const preview = await call(coach, scoreBody(classInfo.classCode, { saveToClass: false }))
    expect(preview.body.saved).toBe(false)

    const dash = await call(classes, { action: 'dashboard', trainerKey })
    expect(dash.status).toBe(200)
    expect(dash.body.attempts).toHaveLength(1)
    expect(dash.body.attempts[0]).toMatchObject({ agentName: 'Sam Lee', scenarioTitle: 'Ready to talk' })
  })

  it('keeps the scorecard when the class code is unknown, and hides dashboards from wrong keys', async () => {
    const res = await call(coach, scoreBody('NOPE12'))
    expect(res.status).toBe(200)
    expect(res.body.saved).toBe(false)
    expect(res.body.saveError).toMatch(/wasn't found/)
    expect((await call(classes, { action: 'dashboard', trainerKey: 'wrong-key' })).status).toBe(404)
  })
})
