import http from 'node:http'
import type { AddressInfo } from 'node:net'

// A stand-in for the Anthropic API, so tests never spend money or need a key.
export type FakeMode = 'ok' | 'credit' | 'badkey' | 'no-fallback'

export interface RecordedRequest {
  model: string
  beta: string | null
  body: Record<string, unknown>
}

const scorecard = {
  overall_score: 86,
  result: 'pass',
  outcome: 'Transferred to the admissions counselor.',
  steps: [{ id: 'greeting', label: 'Opening', status: 'done', evidence: 'Introduced with full name.' }],
  scenario_criteria: [{ criterion: 'Completes the flow', met: true, evidence: 'Yes.' }],
  compliance: [{ rule: 'Honor do-not-call', status: 'ok', evidence: 'n/a' }],
  soft_skills: ['Tone', 'Empathy', 'Pacing', 'Objection handling', 'Confidence'].map((skill) => ({
    skill,
    score: 4,
    note: 'Good.',
  })),
  strengths: ['Clear opening'],
  coaching: ['Give the disclosure earlier.'],
}

const flowDraft = {
  name: 'Appointment reminder call',
  company: 'Brightside Dental',
  purpose: 'Call patients to confirm tomorrow\'s appointment.',
  endGoal: 'The patient confirms or reschedules',
  steps: [
    { label: 'Greeting', guide: 'Say your name and that you are calling from Brightside Dental.' },
    { label: 'Confirm identity', guide: 'Make sure you are speaking with the patient.' },
    { label: 'Confirm time', guide: 'Read the appointment time and ask if it still works.' },
  ],
  rules: ['Never share appointment details with anyone but the patient.'],
}

const draft = {
  title: 'Night classes only',
  difficulty: 'Medium',
  focus: 'The caller only cares about night classes.',
  leadName: 'Maria Lopez',
  program: "Bachelor's in Nursing",
  persona: 'You are Maria Lopez, 24. You work days and only want night classes. Warm up if the agent listens.',
  successCriteria: ['Asks which times work'],
  notApplicable: [],
}

export async function startFakeAnthropic() {
  let mode: FakeMode = 'ok'
  const requests: RecordedRequest[] = []

  const server = http.createServer((req, res) => {
    let raw = ''
    req.on('data', (chunk) => (raw += chunk))
    req.on('end', () => {
      const body = JSON.parse(raw || '{}')
      const beta = (req.headers['anthropic-beta'] as string | undefined) ?? null
      requests.push({ model: body.model, beta, body })
      res.setHeader('content-type', 'application/json')
      const fail = (status: number, type: string, message: string) => {
        res.statusCode = status
        res.end(JSON.stringify({ type: 'error', error: { type, message } }))
      }
      if (mode === 'credit') return fail(400, 'invalid_request_error', 'Your credit balance is too low to access the Anthropic API.')
      if (mode === 'badkey') return fail(401, 'authentication_error', 'invalid x-api-key')
      if (mode === 'no-fallback' && (beta?.includes('server-side-fallback') || body.fallbacks)) {
        return fail(400, 'invalid_request_error', 'The beta server-side-fallback is not enabled for this organization.')
      }
      const prompt = JSON.stringify(body.messages)
      const text = prompt.includes('into a call flow')
        ? JSON.stringify(flowDraft)
        : prompt.includes('build practice scenarios')
        ? JSON.stringify(draft)
        : body.output_config?.format
          ? JSON.stringify(scorecard)
          : 'Hi, this is Jordan.'
      res.end(
        JSON.stringify({
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          model: body.model,
          content: [{ type: 'text', text }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      )
    })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    setMode: (m: FakeMode) => {
      mode = m
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

export type FakeAnthropic = Awaited<ReturnType<typeof startFakeAnthropic>>
