import { CALL_FLOW, SCENARIOS, SCHOOL_NAME, type Scenario } from '../../shared/scenarios.ts'

interface Props {
  agentName: string
  onNameChange: (name: string) => void
  onStart: (scenario: Scenario) => void
}

export default function Home({ agentName, onNameChange, onStart }: Props) {
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
