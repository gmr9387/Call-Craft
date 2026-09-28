import { useEffect, useState } from 'react'
import { MAX_RULES, MAX_STEPS, type CallFlow, type FlowInputValue, type FlowSummary } from '../../shared/flows.ts'
import { archiveFlow, draftFlow, listFlows, saveFlow } from '../api.ts'

// ---- The list of call flows ----

interface ListProps {
  onEdit: (flow: CallFlow | null, copy?: boolean) => void
}

export default function FlowsView({ onEdit }: ListProps) {
  const [flows, setFlows] = useState<FlowSummary[] | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listFlows().then(
      (list) => !cancelled && setFlows(list),
      (err) => !cancelled && setError(err instanceof Error ? err.message : 'Could not load call flows.'),
    )
    return () => {
      cancelled = true
    }
  }, [])

  const toggleArchived = async (flow: FlowSummary) => {
    setBusyId(flow.id)
    setError(null)
    try {
      await archiveFlow(flow.id, !flow.archived)
      setFlows(await listFlows())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the call flow.')
    } finally {
      setBusyId(null)
    }
  }

  const archivedCount = flows?.filter((f) => f.archived).length ?? 0
  const shown = flows?.filter((f) => showArchived || !f.archived) ?? []

  return (
    <div className="history">
      <div className="page-head">
        <h1>Call flows</h1>
        <p className="muted">
          A call flow is the script agents are scored on: who they call for, the steps in order, and the rules they
          can't break. Each class uses one call flow.
        </p>
      </div>

      <div className="card scenarios-intro">
        <div>
          <h2>Set up a new kind of call</h2>
          <p className="muted">Describe the call in a few sentences and CallCraft writes the steps and rules for you.</p>
        </div>
        <button className="primary big" onClick={() => onEdit(null)}>
          + New call flow
        </button>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {!flows ? (
        <p className="card empty">Loading…</p>
      ) : (
        <div className="scenario-grid">
          {shown.map((f) => (
            <article key={f.id} className={`card scenario-card ${f.archived ? 'is-hidden' : ''}`}>
              <div className="scenario-head">
                <h3>{f.name}</h3>
                {f.builtIn && <span className="pill">Sample</span>}
                {f.archived && <span className="pill">Archived</span>}
              </div>
              <p className="muted small">Calling for {f.company}</p>
              <p>{f.purpose}</p>
              <p className="muted small">
                {f.steps.length} steps · {f.rules.length} {f.rules.length === 1 ? 'rule' : 'rules'} · used by{' '}
                {f.classCount} {f.classCount === 1 ? 'class' : 'classes'}
              </p>
              <div className="card-actions">
                {f.builtIn ? (
                  <button className="secondary" onClick={() => onEdit(f)}>
                    View
                  </button>
                ) : (
                  <button className="secondary" onClick={() => onEdit(f)}>
                    Edit
                  </button>
                )}
                <button className="secondary" onClick={() => onEdit(f, true)}>
                  Make a copy
                </button>
                {!f.builtIn && (
                  <button className="link" disabled={busyId === f.id} onClick={() => void toggleArchived(f)}>
                    {f.archived ? 'Bring back' : 'Archive'}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {archivedCount > 0 && (
        <div className="actions-right">
          <button className="link muted-link" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? 'Hide archived call flows' : `Show archived call flows (${archivedCount})`}
          </button>
        </div>
      )}
    </div>
  )
}

// ---- Building or editing one call flow ----

interface BuilderProps {
  flow: CallFlow | null
  // Start from a copy of `flow` instead of editing it.
  copy?: boolean
  onDone: () => void
}

const EMPTY: FlowInputValue = {
  name: '',
  company: '',
  purpose: '',
  endGoal: '',
  steps: [
    { label: '', guide: '' },
    { label: '', guide: '' },
  ],
  rules: [],
}

function fieldsFrom(flow: CallFlow, copy: boolean): FlowInputValue {
  return {
    name: copy ? `${flow.name.replace(/^Sample: /, '')} (copy)`.slice(0, 100) : flow.name,
    company: flow.company,
    purpose: flow.purpose,
    endGoal: flow.endGoal,
    // A copy is a new flow, so its steps get new ids.
    steps: flow.steps.map((s) => (copy ? { label: s.label, guide: s.guide } : { ...s })),
    rules: [...flow.rules],
  }
}

const IDEAS = [
  'We call people who asked about solar panels and book a home visit with a specialist.',
  'We call customers whose warranty is about to end and offer a renewal. We must not pressure them.',
  'We call patients to confirm tomorrow’s appointment and reschedule if needed.',
]

export function FlowBuilder({ flow, copy = false, onDone }: BuilderProps) {
  const readOnly = !!flow?.builtIn && !copy
  const [fields, setFields] = useState<FlowInputValue>(() => (flow ? fieldsFrom(flow, copy) : EMPTY))
  const [description, setDescription] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof FlowInputValue>(key: K, value: FlowInputValue[K]) =>
    setFields((f) => ({ ...f, [key]: value }))

  const setStep = (i: number, key: 'label' | 'guide', value: string) =>
    set(
      'steps',
      fields.steps.map((s, j) => (j === i ? { ...s, [key]: value } : s)),
    )

  const moveStep = (i: number, by: -1 | 1) => {
    const steps = [...fields.steps]
    ;[steps[i], steps[i + by]] = [steps[i + by], steps[i]]
    set('steps', steps)
  }

  const writeForMe = async () => {
    setDrafting(true)
    setError(null)
    try {
      setFields(await draftFlow(description))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not write the call flow.')
    } finally {
      setDrafting(false)
    }
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const cleaned = {
        ...fields,
        steps: fields.steps.filter((s) => s.label.trim() || s.guide.trim()),
        rules: fields.rules.map((r) => r.trim()).filter(Boolean),
      }
      await saveFlow(cleaned, flow && !copy ? flow.id : undefined)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the call flow.')
      setSaving(false)
    }
  }

  const filledSteps = fields.steps.filter((s) => s.label.trim() && s.guide.trim())
  const ready =
    fields.name.trim() &&
    fields.company.trim() &&
    fields.purpose.trim() &&
    fields.endGoal.trim() &&
    filledSteps.length >= 2 &&
    fields.steps.every((s) => (s.label.trim() ? !!s.guide.trim() : !s.guide.trim()))

  return (
    <div className="builder">
      <div className="builder-head">
        <div>
          <p className="eyebrow">Call flows</p>
          <h1>{readOnly ? fields.name : flow && !copy ? 'Edit call flow' : 'New call flow'}</h1>
        </div>
        <button className="secondary" onClick={onDone} disabled={saving}>
          {readOnly ? 'Back' : 'Cancel'}
        </button>
      </div>

      {readOnly && (
        <p className="notice">This sample comes with CallCraft and can't be changed. Use "Make a copy" to build on it.</p>
      )}

      {!readOnly && (
        <section className="card write-for-me">
          <h2>1. Describe the call</h2>
          <p className="muted">
            Say who agents call, why, and how a good call ends. Add any rules they must follow. A few sentences is
            enough.
          </p>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Example: We call people who asked about home internet. Confirm their address, ask what they use the internet for, and book an install. Never promise speeds."
            rows={4}
            maxLength={4000}
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
      )}

      <fieldset className="card builder-form" disabled={readOnly}>
        <h2>{readOnly ? 'The call flow' : '2. Check it and make changes'}</h2>
        {!readOnly && <p className="muted">Agents see the steps as their call guide. The scorer checks every step and rule.</p>}

        <div className="form-grid">
          <label className="field">
            <span>Call flow name</span>
            <input value={fields.name} onChange={(e) => set('name', e.target.value)} placeholder="Example: Warranty renewal call" maxLength={100} />
          </label>
          <label className="field">
            <span>Company or brand the agent calls for</span>
            <input value={fields.company} onChange={(e) => set('company', e.target.value)} placeholder="Example: Northwind Home Services" maxLength={100} />
          </label>
          <label className="field wide">
            <span>What is the call for?</span>
            <textarea
              value={fields.purpose}
              onChange={(e) => set('purpose', e.target.value)}
              rows={2}
              maxLength={300}
              placeholder="Example: Call customers whose warranty ends this month and offer a renewal."
            />
          </label>
          <label className="field wide">
            <span>How does a good call end?</span>
            <input
              value={fields.endGoal}
              onChange={(e) => set('endGoal', e.target.value)}
              placeholder="Example: The customer renews, or asks for a callback at a set time"
              maxLength={200}
            />
          </label>

          <div className="field wide">
            <span>Steps, in order</span>
            <small>Each step has a short name and what the agent says or does. Up to {MAX_STEPS}.</small>
            <ol className="flow-steps">
              {fields.steps.map((step, i) => (
                <li key={i} className="flow-step">
                  <span className="step-num">{i + 1}</span>
                  <div className="flow-step-fields">
                    <input
                      value={step.label}
                      onChange={(e) => setStep(i, 'label', e.target.value)}
                      placeholder="Step name, e.g. Greeting"
                      maxLength={60}
                      aria-label={`Step ${i + 1} name`}
                    />
                    <textarea
                      value={step.guide}
                      onChange={(e) => setStep(i, 'guide', e.target.value)}
                      rows={2}
                      maxLength={300}
                      placeholder="What the agent says or does"
                      aria-label={`Step ${i + 1} instructions`}
                    />
                  </div>
                  {!readOnly && (
                    <div className="flow-step-actions">
                      <button className="link" disabled={i === 0} onClick={() => moveStep(i, -1)} aria-label={`Move step ${i + 1} up`}>
                        ↑
                      </button>
                      <button
                        className="link"
                        disabled={i === fields.steps.length - 1}
                        onClick={() => moveStep(i, 1)}
                        aria-label={`Move step ${i + 1} down`}
                      >
                        ↓
                      </button>
                      {fields.steps.length > 2 && (
                        <button
                          className="link muted-link"
                          onClick={() => set('steps', fields.steps.filter((_, j) => j !== i))}
                          aria-label={`Remove step ${i + 1}`}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ol>
            {!readOnly && fields.steps.length < MAX_STEPS && (
              <button className="secondary" onClick={() => set('steps', [...fields.steps, { label: '', guide: '' }])}>
                + Add a step
              </button>
            )}
          </div>

          <div className="field wide">
            <span>Rules the agent must never break</span>
            <small>Breaking any rule fails the call. For example: "Never quote prices." Up to {MAX_RULES}.</small>
            {fields.rules.length === 0 && <p className="muted small">No rules yet.</p>}
            <ol className="goals">
              {fields.rules.map((rule, i) => (
                <li key={i}>
                  <div className="goal-row">
                    <input
                      value={rule}
                      onChange={(e) => set('rules', fields.rules.map((r, j) => (j === i ? e.target.value : r)))}
                      placeholder="Example: Never promise a discount"
                      maxLength={300}
                      aria-label={`Rule ${i + 1}`}
                    />
                    {!readOnly && (
                      <button
                        className="link"
                        onClick={() => set('rules', fields.rules.filter((_, j) => j !== i))}
                        aria-label={`Remove rule ${i + 1}`}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ol>
            {!readOnly && fields.rules.length < MAX_RULES && (
              <button className="secondary" onClick={() => set('rules', [...fields.rules, ''])}>
                + Add a rule
              </button>
            )}
          </div>
        </div>
      </fieldset>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {!readOnly && (
        <>
          <div className="actions-right save-bar">
            <button className="primary big" onClick={() => void save()} disabled={!ready || saving}>
              {saving ? 'Saving…' : 'Save call flow'}
            </button>
          </div>
          {!ready && (
            <p className="muted small actions-right">Fill in the name, company, purpose, goal, and at least 2 steps to save.</p>
          )}
        </>
      )}
    </div>
  )
}
