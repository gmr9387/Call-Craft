import { useState, type FormEvent } from 'react'
import type { ClassInfo } from '../../shared/classes.ts'
import { CALL_FLOW, SCENARIOS, SCHOOL_NAME, type Scenario } from '../../shared/scenarios.ts'
import { joinClass } from '../api.ts'

interface Props {
  agentName: string
  onNameChange: (name: string) => void
  classInfo: ClassInfo | null
  onClassChange: (info: ClassInfo | null) => void
  onStart: (scenario: Scenario) => void
}

function ClassJoin({ classInfo, onClassChange }: Pick<Props, 'classInfo' | 'onClassChange'>) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (classInfo) {
    return (
      <div className="class-joined">
        <span>
          Practicing in <strong>{classInfo.name}</strong> <span className="muted">({classInfo.classCode})</span>. Your
          scored calls are shared with your trainer.
        </span>
        <button className="link" onClick={() => onClassChange(null)}>
          Leave class
        </button>
      </div>
    )
  }

  const join = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onClassChange(await joinClass(code))
      setCode('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join that class.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="class-join" onSubmit={join}>
      <label>
        <span>Class code (optional, from your trainer)</span>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="e.g. K7M4QX"
          maxLength={20}
          autoComplete="off"
        />
      </label>
      <button className="secondary" type="submit" disabled={!code.trim() || busy}>
        {busy ? 'Joining…' : 'Join class'}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}

export default function Home({ agentName, onNameChange, classInfo, onClassChange, onStart }: Props) {
  return (
    <div className="home">
      <section className="hero">
        <h1>Practice the call before it counts.</h1>
        <p>
          Run realistic outbound calls with an AI prospect, then get scored on the call flow, compliance, and soft
          skills, with specific coaching.
        </p>
        <label className="name-field">
          <span>Your name (used on the call and in the trainer view)</span>
          <input
            value={agentName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="First and last name"
            autoComplete="name"
          />
        </label>
        <ClassJoin classInfo={classInfo} onClassChange={onClassChange} />
      </section>

      <section>
        <h2>Pick a scenario</h2>
        <p className="muted">
          Outbound inquiry call for {SCHOOL_NAME} (a fictional school). Every scenario uses the same call flow; the
          prospect is what changes.
        </p>
        <div className="scenario-grid">
          {SCENARIOS.map((s) => (
            <article key={s.id} className="card scenario-card">
              <div className="scenario-head">
                <h3>{s.title}</h3>
                <span className={`pill difficulty-${s.difficulty.toLowerCase()}`}>{s.difficulty}</span>
              </div>
              <p>{s.focus}</p>
              <dl className="lead">
                <div>
                  <dt>Lead</dt>
                  <dd>{s.leadName}</dd>
                </div>
                <div>
                  <dt>Program</dt>
                  <dd>{s.program}</dd>
                </div>
              </dl>
              <button className="primary" disabled={!agentName.trim()} onClick={() => onStart(s)}>
                Start call
              </button>
            </article>
          ))}
        </div>
        {!agentName.trim() && <p className="muted small">Enter your name above to start a call.</p>}
      </section>

      <section className="card flow-card">
        <h2>The call flow you're scored on</h2>
        <ol className="flow-list">
          {CALL_FLOW.map((step) => (
            <li key={step.id}>
              <strong>{step.label}.</strong> {step.guide}
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
