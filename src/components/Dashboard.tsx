import type { ClassInfo, JoinResult } from '../../shared/classes.ts'
import { SCENARIOS, type Scenario } from '../../shared/scenarios.ts'
import type { Me } from '../../shared/accounts.ts'
import type { CallFlow } from '../../shared/flows.ts'
import type { Requirements } from '../../shared/classes.ts'
import { attemptTitle, resultOf, scoreOf, type Attempt } from '../history.ts'
import { ClassJoin } from './Home.tsx'
import { useMyCalls } from '../useMyCalls.ts'

interface Props {
  user: Me
  flow: CallFlow
  // What this agent must pass to be ready for live calls, and what they've passed.
  progress: { requirements: Requirements; passed: string[] } | null
  classInfo: ClassInfo | null
  classScenarios: Scenario[]
  onJoin: (result: JoinResult) => void
  onStart: (scenario: Scenario) => void
  onPractice: () => void
  onMyCalls: () => void
  onOpen: (attempt: Attempt) => void
}

const RESULT_LABEL = { pass: '✓ Pass', needs_work: '! Needs work', fail: '✕ Fail' } as const

// The first call the agent hasn't passed yet, trainer-made calls first.
function nextUp(scenarios: Scenario[], attempts: Attempt[]): Scenario | undefined {
  const passed = new Set(attempts.filter((a) => resultOf(a) === 'pass').map((a) => a.scenarioId))
  return scenarios.find((s) => !passed.has(s.id)) ?? scenarios[0]
}

export default function Dashboard({
  user,
  flow,
  progress,
  classInfo,
  classScenarios,
  onJoin,
  onStart,
  onPractice,
  onMyCalls,
  onOpen,
}: Props) {
  const firstName = user.name.split(' ')[0]
  const { attempts: loaded, error } = useMyCalls()
  const attempts = loaded ?? []
  // Sample calls only fit the sample call flow.
  const next = nextUp(flow.builtIn ? [...classScenarios, ...SCENARIOS] : classScenarios, attempts)
  const recent = attempts.slice(0, 5)
  const passes = attempts.filter((a) => resultOf(a) === 'pass').length
  const average = attempts.length
    ? Math.round(attempts.reduce((n, a) => n + scoreOf(a), 0) / attempts.length)
    : null

  return (
    <div className="dashboard">
      <div className="page-head">
        <h1>Welcome, {firstName}</h1>
        <p className="muted">Here's where you are. Pick up where you left off.</p>
      </div>

      <div className="dash-grid">
        <section className="card next-card">
          <img className="next-photo" src="/photos/agent-desk.webp" alt="" width={800} height={1200} />
          <div className="next-body">
            <p className="eyebrow">Next up</p>
            {next ? (
              <>
                <h2>{next.title}</h2>
                <p>{next.focus}</p>
                <div className="card-actions">
                  <button className="primary big" onClick={() => onStart(next)}>
                    Start this call
                  </button>
                  <button className="secondary big" onClick={onPractice}>
                    Pick a different call
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2>No practice calls yet</h2>
                <p>Your trainer is still setting up practice calls for {classInfo?.name ?? 'your class'}. Check back soon.</p>
              </>
            )}
          </div>
        </section>

        <section className="card profile-card">
          <h2>You</h2>
          <p>
            <strong>{user.name}</strong>
            <br />
            <span className="muted small">{user.email}</span>
          </p>
          <ClassJoin classInfo={classInfo} onJoin={onJoin} />
        </section>
      </div>

      {progress && progress.requirements.scenarioIds.length > 0 && (
        <ReadyCard progress={progress} scenarios={[...classScenarios, ...SCENARIOS]} onStart={onStart} />
      )}

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
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : !loaded ? (
          <p className="muted">Loading your calls…</p>
        ) : recent.length === 0 ? (
          <p className="muted">No calls yet. Your scores will show up here after your first call.</p>
        ) : (
          <ul className="recent-list">
            {recent.map((a) => (
              <li key={a.id}>
                <span className="recent-title">{attemptTitle(a)}</span>
                <span className="muted small">{new Date(a.startedAt).toLocaleDateString()}</span>
                <span className="recent-score">{scoreOf(a)}</span>
                <span className={`status status-${resultOf(a)}`}>{RESULT_LABEL[resultOf(a)]}</span>
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

function ReadyCard({
  progress,
  scenarios,
  onStart,
}: {
  progress: { requirements: Requirements; passed: string[] }
  scenarios: Scenario[]
  onStart: (scenario: Scenario) => void
}) {
  const { scenarioIds, passScore } = progress.requirements
  const done = scenarioIds.filter((id) => progress.passed.includes(id)).length
  const ready = done >= scenarioIds.length
  return (
    <section className={`card ready-card ${ready ? 'is-ready' : ''}`}>
      <div className="section-head">
        <h2>{ready ? '✓ You’re ready for live calls' : 'Ready for live calls'}</h2>
        <span className="muted">
          {done} of {scenarioIds.length} passed
        </span>
      </div>
      <p className="muted small">
        {ready
          ? 'You passed every required practice call. Let your trainer know.'
          : `Pass each of these calls with a score of ${passScore} or higher.`}
      </p>
      <ul className="ready-list">
        {scenarioIds.map((id) => {
          const scenario = scenarios.find((s) => s.id === id)
          const passed = progress.passed.includes(id)
          return (
            <li key={id} className={passed ? 'passed' : ''}>
              <span aria-hidden>{passed ? '✓' : '○'}</span>
              <span>{scenario?.title ?? 'A practice call'}</span>
              {!passed && scenario && (
                <button className="link" onClick={() => onStart(scenario)}>
                  Practice it
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
