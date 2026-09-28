import type { ClassInfo, JoinResult } from '../../shared/classes.ts'
import { SCENARIOS, type Scenario } from '../../shared/scenarios.ts'
import { attemptTitle, type Attempt } from '../history.ts'
import { ClassJoin } from './Home.tsx'

interface Props {
  agentName: string
  onNameChange: (name: string) => void
  classInfo: ClassInfo | null
  classScenarios: Scenario[]
  attempts: Attempt[]
  onJoin: (result: JoinResult) => void
  onLeave: () => void
  onStart: (scenario: Scenario) => void
  onPractice: () => void
  onMyCalls: () => void
  onOpen: (attempt: Attempt) => void
}

const RESULT_LABEL = { pass: '✓ Pass', needs_work: '! Needs work', fail: '✕ Fail' } as const

// The first call the agent hasn't passed yet, trainer-made calls first.
function nextUp(scenarios: Scenario[], attempts: Attempt[]): Scenario {
  const passed = new Set(attempts.filter((a) => a.scorecard.result === 'pass').map((a) => a.scenarioId))
  return scenarios.find((s) => !passed.has(s.id)) ?? scenarios[0]
}

export default function Dashboard({
  agentName,
  onNameChange,
  classInfo,
  classScenarios,
  attempts,
  onJoin,
  onLeave,
  onStart,
  onPractice,
  onMyCalls,
  onOpen,
}: Props) {
  const firstName = agentName.trim().split(/\s+/)[0]
  const hasName = !!firstName
  const next = nextUp([...classScenarios, ...SCENARIOS], attempts)
  const recent = attempts.slice(0, 5)
  const passes = attempts.filter((a) => a.scorecard.result === 'pass').length
  const average = attempts.length
    ? Math.round(attempts.reduce((n, a) => n + a.scorecard.overall_score, 0) / attempts.length)
    : null

  return (
    <div className="dashboard">
      <div className="page-head">
        <h1>{hasName ? `Welcome back, ${firstName}` : 'Welcome to CallCraft'}</h1>
        <p className="muted">Here's where you are. Pick up where you left off.</p>
      </div>

      <div className="dash-grid">
        <section className="card next-card">
          <img className="next-photo" src="/photos/agent-desk.webp" alt="" width={800} height={1200} />
          <div className="next-body">
            <p className="eyebrow">Next up</p>
            <h2>{next.title}</h2>
            <p>{next.focus}</p>
            {!hasName && (
              <label className="name-field">
                <span>Type your name to start</span>
                <input
                  value={agentName}
                  onChange={(e) => onNameChange(e.target.value)}
                  placeholder="First and last name"
                  autoComplete="name"
                />
              </label>
            )}
            <div className="card-actions">
              <button className="primary big" disabled={!hasName} onClick={() => onStart(next)}>
                Start this call
              </button>
              <button className="secondary big" onClick={onPractice}>
                Pick a different call
              </button>
            </div>
          </div>
        </section>

        <section className="card profile-card">
          <h2>You</h2>
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
      </div>

      <div className="stat-row">
        <div className="card stat">
          <span className="stat-label">Practice calls</span>
          <span className="stat-value">{attempts.length}</span>
        </div>
        <div className="card stat">
          <span className="stat-label">Average score</span>
          <span className="stat-value">{average ?? '–'}</span>
        </div>
        <div className="card stat">
          <span className="stat-label">Calls passed</span>
          <span className="stat-value">
            {passes}
            <span className="stat-of"> / {attempts.length}</span>
          </span>
        </div>
      </div>

      <section className="card">
        <div className="section-head">
          <h2>Recent calls</h2>
          {attempts.length > 0 && (
            <button className="link" onClick={onMyCalls}>
              See all
            </button>
          )}
        </div>
        {recent.length === 0 ? (
          <p className="muted">No calls yet. Your scores will show up here after your first call.</p>
        ) : (
          <ul className="recent-list">
            {recent.map((a) => (
              <li key={a.id}>
                <span className="recent-title">{attemptTitle(a)}</span>
                <span className="muted small">{new Date(a.startedAt).toLocaleDateString()}</span>
                <span className="recent-score">{Math.round(a.scorecard.overall_score)}</span>
                <span className={`status status-${a.scorecard.result}`}>{RESULT_LABEL[a.scorecard.result]}</span>
                <button className="link" onClick={() => onOpen(a)}>
                  View
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
