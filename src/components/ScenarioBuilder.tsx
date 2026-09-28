import { useState } from 'react'
import type { CallFlow } from '../../shared/flows.ts'
import { DIFFICULTIES, type Scenario } from '../../shared/scenarios.ts'
import { draftScenario, saveScenario, type ScenarioFields } from '../api.ts'

interface Props {
  // Scenarios belong to the call flow, so every class on it gets this scenario.
  flow: CallFlow
  // The scenario being edited, or null for a new one.
  scenario: Scenario | null
  onSaved: (scenario: Scenario, tryIt: boolean) => void
  onCancel: () => void
}

const EMPTY: ScenarioFields = {
  title: '',
  difficulty: 'Medium',
  focus: '',
  leadName: '',
  program: '',
  persona: '',
  successCriteria: [''],
  notApplicable: [],
}

function fieldsFrom(s: Scenario): ScenarioFields {
  return {
    title: s.title,
    difficulty: s.difficulty,
    focus: s.focus,
    leadName: s.leadName,
    program: s.program,
    persona: s.persona,
    successCriteria: s.successCriteria.length ? s.successCriteria : [''],
    notApplicable: (s.notApplicable ?? []) as ScenarioFields['notApplicable'],
  }
}

const IDEAS = [
  'Someone nervous who asks a lot of questions',
  'A busy parent who keeps saying "just email me the info"',
  'Someone who thinks this call is a scam',
]

export default function ScenarioBuilder({ flow, scenario, onSaved, onCancel }: Props) {
  const [fields, setFields] = useState<ScenarioFields>(() => (scenario ? fieldsFrom(scenario) : EMPTY))
  const [description, setDescription] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof ScenarioFields>(key: K, value: ScenarioFields[K]) =>
    setFields((f) => ({ ...f, [key]: value }))

  const setGoal = (i: number, value: string) =>
    set(
      'successCriteria',
      fields.successCriteria.map((g, j) => (j === i ? value : g)),
    )

  const writeForMe = async () => {
    setDrafting(true)
    setError(null)
    try {
      const draft = await draftScenario(flow.id, description)
      setFields({ ...draft, successCriteria: draft.successCriteria.length ? draft.successCriteria : [''] })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not write the scenario.')
    } finally {
      setDrafting(false)
    }
  }

  const save = async (tryIt: boolean) => {
    setSaving(true)
    setError(null)
    try {
      const cleaned = { ...fields, successCriteria: fields.successCriteria.map((g) => g.trim()).filter(Boolean) }
      onSaved(await saveScenario(flow.id, cleaned, scenario?.id, scenario?.updatedAt), tryIt)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the scenario.')
      setSaving(false)
    }
  }

  const ready =
    fields.title.trim() &&
    fields.focus.trim() &&
    fields.leadName.trim() &&
    fields.program.trim() &&
    fields.persona.trim().length >= 20 &&
    fields.successCriteria.some((g) => g.trim())

  return (
    <div className="builder">
      <div className="builder-head">
        <div>
          <p className="eyebrow">
            {flow.name} · shared by every class on this call flow
          </p>
          <h1>{scenario ? 'Edit scenario' : 'New scenario'}</h1>
        </div>
        <button className="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>

      <section className="card write-for-me">
        <h2>1. Describe the caller</h2>
        <p className="muted">Write one sentence about who the agent will talk to. We'll fill in the rest for you.</p>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Example: Someone who is only interested if it fits their night schedule"
          rows={2}
          maxLength={1000}
        />
        <div className="idea-row">
          <span className="muted small">Ideas:</span>
          {IDEAS.map((idea) => (
            <button key={idea} className="chip" onClick={() => setDescription(idea)}>
              {idea}
            </button>
          ))}
        </div>
        <div className="actions-right">
          <button className="primary big" onClick={() => void writeForMe()} disabled={!description.trim() || drafting}>
            {drafting ? 'Writing… (about 20 seconds)' : '✨ Write it for me'}
          </button>
        </div>
      </section>

      <section className="card builder-form">
        <h2>2. Check it and make changes</h2>
        <p className="muted">Change anything you want. Agents only see the name, the difficulty, and what to practice.</p>

        <div className="form-grid">
          <label className="field wide">
            <span>Scenario name</span>
            <input
              value={fields.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Example: Night classes only"
              maxLength={80}
            />
          </label>

          <div className="field wide">
            <span>How hard is it?</span>
            <div className="segmented" role="radiogroup" aria-label="Difficulty">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d}
                  role="radio"
                  aria-checked={fields.difficulty === d}
                  className={fields.difficulty === d ? 'selected' : ''}
                  onClick={() => set('difficulty', d)}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <label className="field">
            <span>Caller's name</span>
            <input
              value={fields.leadName}
              onChange={(e) => set('leadName', e.target.value)}
              placeholder="Example: Maria Lopez"
              maxLength={80}
            />
          </label>

          <label className="field">
            <span>What the call is about for them</span>
            <input
              value={fields.program}
              onChange={(e) => set('program', e.target.value)}
              placeholder="Example: Home internet plan"
              maxLength={120}
            />
          </label>

          <label className="field wide">
            <span>What should the agent practice?</span>
            <small>Agents see this before the call.</small>
            <textarea
              value={fields.focus}
              onChange={(e) => set('focus', e.target.value)}
              rows={2}
              maxLength={400}
              placeholder="Example: Stay calm and keep the caller on the line until the transfer."
            />
          </label>

          <label className="field wide">
            <span>Who is the caller, and how do they act?</span>
            <small>Only the AI sees this. Say how they react when the agent does well, and when the agent doesn't.</small>
            <textarea
              value={fields.persona}
              onChange={(e) => set('persona', e.target.value)}
              rows={7}
              maxLength={3000}
              placeholder="Example: You are Maria, 24. You work days, so you only care about night classes. If the agent listens, you warm up. If they rush you, you say you have to go."
            />
          </label>

          <div className="field wide">
            <span>What must the agent do to pass?</span>
            <small>The scorecard checks each one. Up to 6.</small>
            <ol className="goals">
              {fields.successCriteria.map((goal, i) => (
                <li key={i}>
                  <div className="goal-row">
                    <input
                    value={goal}
                    onChange={(e) => setGoal(i, e.target.value)}
                    placeholder="Example: Asks which times work for them"
                    maxLength={200}
                    aria-label={`Goal ${i + 1}`}
                  />
                  {fields.successCriteria.length > 1 && (
                    <button
                      className="link"
                      onClick={() => set('successCriteria', fields.successCriteria.filter((_, j) => j !== i))}
                      aria-label={`Remove goal ${i + 1}`}
                    >
                      Remove
                    </button>
                  )}
                  </div>
                </li>
              ))}
            </ol>
            {fields.successCriteria.length < 6 && (
              <button className="secondary" onClick={() => set('successCriteria', [...fields.successCriteria, ''])}>
                + Add another
              </button>
            )}
          </div>
        </div>
      </section>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="actions-right save-bar">
        <button className="secondary big" onClick={() => void save(false)} disabled={!ready || saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button className="primary big" onClick={() => void save(true)} disabled={!ready || saving}>
          Save and try it
        </button>
      </div>
      {!ready && <p className="muted small actions-right">Fill in every box to save.</p>}
    </div>
  )
}
