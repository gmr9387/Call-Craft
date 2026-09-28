import { useState, type FormEvent } from 'react'
import type { ClassInfo, JoinResult } from '../../shared/classes.ts'
import { CALL_FLOW, SCENARIOS, SCHOOL_NAME, type Scenario } from '../../shared/scenarios.ts'
import { joinClass } from '../api.ts'

interface Props {
  agentName: string
  onNameChange: (name: string) => void
  classInfo: ClassInfo | null
  classScenarios: Scenario[]
  onJoin: (result: JoinResult) => void
  onLeave: () => void
  onStart: (scenario: Scenario) => void
}

function ClassJoin({ classInfo, onJoin, onLeave }: Pick<Props, 'classInfo' | 'onJoin' | 'onLeave'>) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (classInfo) {
    return (
      <div className="class-joined">
        <span>
          You're in <strong>{classInfo.name}</strong>. Your trainer can see your scores.
        </span>
        <button className="link" onClick={onLeave}>
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
      onJoin(await joinClass(code))
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
        <span>Class code (your trainer gives you this)</span>
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

function ScenarioGrid({
  scenarios,
  canStart,
  onStart,
}: {
  scenarios: Scenario[]
  canStart: boolean
  onStart: (scenario: Scenario) => void
}) {
  return (
    <div className="scenario-grid">
      {scenarios.map((s) => (
        <article key={s.id} className="card scenario-card">
          <div className="scenario-head">
            <h3>{s.title}</h3>
            <span className={`pill difficulty-${s.difficulty.toLowerCase()}`}>{s.difficulty}</span>
          </div>
          <p>{s.focus}</p>
          <dl className="lead">
            <div>
              <dt>Calling</dt>
              <dd>{s.leadName}</dd>
            </div>
            <div>
              <dt>Program</dt>
              <dd>{s.program}</dd>
            </div>
          </dl>
          <button className="primary" disabled={!canStart} onClick={() => onStart(s)}>
            Start call
          </button>
        </article>
      ))}
    </div>
  )
}

export default function Home({ agentName, onNameChange, classInfo, classScenarios, onJoin, onLeave, onStart }: Props) {
  return (
    <div className="home">
      <section className="hero">
        <h1>Practice a call</h1>
        <p>Talk to a pretend caller. When the call ends, you get a score and tips to get better.</p>
        <label className="name-field">
          <span>Your name</span>
          <input
            value={agentName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="First and last name"
            autoComplete="name"
          />
        </label>
        <ClassJoin classInfo={classInfo} onJoin={onJoin} onLeave={onLeave} />
      </section>

      {classScenarios.length > 0 && (
        <section>
          <h2>From your trainer</h2>
          <p className="muted">Practice calls made for {classInfo?.name}.</p>
          <ScenarioGrid scenarios={classScenarios} canStart={!!agentName.trim()} onStart={onStart} />
        </section>
      )}

      <section>
        <h2>{classScenarios.length > 0 ? 'More practice calls' : 'Pick a practice call'}</h2>
        <p className="muted">
          You'll call someone who asked about {SCHOOL_NAME} (a made-up school). Each call has a different kind of
          person on the other end.
        </p>
        <ScenarioGrid scenarios={SCENARIOS} canStart={!!agentName.trim()} onStart={onStart} />
        {!agentName.trim() && <p className="muted small">Type your name above to start a call.</p>}
      </section>

      <section className="card flow-card">
        <h2>The steps of every call</h2>
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
