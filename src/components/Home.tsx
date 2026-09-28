import { useState, type FormEvent } from 'react'
import type { ClassInfo, JoinResult } from '../../shared/classes.ts'
import { SCENARIOS, type Scenario } from '../../shared/scenarios.ts'
import type { CallFlow } from '../../shared/flows.ts'
import { joinClass } from '../api.ts'
import CallerAvatar from './CallerAvatar.tsx'

interface Props {
  classInfo: ClassInfo | null
  // The class's call flow (the built-in sample when not in a class).
  flow: CallFlow
  classScenarios: Scenario[]
  onStart: (scenario: Scenario) => void
}

interface ClassJoinProps {
  classInfo: ClassInfo | null
  onJoin: (result: JoinResult) => void
}

// An agent's class, with a way to move to another class using its code.
export function ClassJoin({ classInfo, onJoin }: ClassJoinProps) {
  const [code, setCode] = useState('')
  const [switching, setSwitching] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (classInfo && !switching) {
    return (
      <div className="class-joined">
        <span>
          You're in <strong>{classInfo.name}</strong>. Your trainer can see your scores.
        </span>
        <button className="link" onClick={() => setSwitching(true)}>
          Switch class
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
      setSwitching(false)
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
      {switching && (
        <button className="link" type="button" onClick={() => setSwitching(false)}>
          Cancel
        </button>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}

export function ScenarioGrid({
  scenarios,
  onStart,
}: {
  scenarios: Scenario[]
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
          <div className="caller">
            <CallerAvatar name={s.leadName} />
            <div>
              <strong>{s.leadName}</strong>
              <span className="muted small">{s.program}</span>
            </div>
          </div>
          <button className="primary" onClick={() => onStart(s)}>
            Start call
          </button>
        </article>
      ))}
    </div>
  )
}

export default function Home({ classInfo, flow, classScenarios, onStart }: Props) {
  return (
    <div className="home">
      <section className="page-head">
        <h1>Practice</h1>
        <p className="muted">Pick a call. When it ends, you get a score and tips.</p>
      </section>

      {classScenarios.length > 0 && (
        <section>
          <h2>From your trainer</h2>
          <p className="muted">Practice calls made for {classInfo?.name}.</p>
          <ScenarioGrid scenarios={classScenarios} onStart={onStart} />
        </section>
      )}

      {flow.builtIn ? (
        <section>
          <h2>{classScenarios.length > 0 ? 'More practice calls' : 'Practice calls'}</h2>
          <p className="muted">
            Sample calls: you'll call someone who asked about {flow.company} (a made-up school). Each call has a
            different kind of person on the other end.
          </p>
          <ScenarioGrid scenarios={SCENARIOS} onStart={onStart} />
        </section>
      ) : (
        classScenarios.length === 0 && (
          <p className="card empty">Your trainer hasn't added practice calls yet. Check back soon.</p>
        )
      )}

      <details className="card flow-card">
        <summary>The steps of every call ({flow.company})</summary>
        <ol className="flow-list">
          {flow.steps.map((step) => (
            <li key={step.id}>
              <strong>{step.label}.</strong> {step.guide}
            </li>
          ))}
        </ol>
        {flow.rules.length > 0 && (
          <>
            <h3>Never break these rules</h3>
            <ul className="flow-list">
              {flow.rules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </>
        )}
      </details>
    </div>
  )
}
