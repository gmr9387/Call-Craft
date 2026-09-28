import { getScenario } from '../../shared/scenarios.ts'
import type { Attempt } from '../history.ts'

interface Props {
  attempt: Attempt
  onRetry: () => void
  onHome: () => void
}

const RESULT_LABEL = { pass: '✓ Pass', needs_work: '! Needs work', fail: '✕ Fail' } as const

const STEP_LABEL = {
  done: '✓ Done',
  missed: '✕ Missed',
  out_of_order: '↺ Out of order',
  not_applicable: '– N/A',
} as const

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(n)))
}

export default function ScorecardView({ attempt, onRetry, onHome }: Props) {
  const { scorecard: sc } = attempt
  const scenario = getScenario(attempt.scenarioId)
  const score = clamp(sc.overall_score, 0, 100)

  return (
    <div className="scorecard">
      <section className="card score-hero">
        <div className="score-number">
          <span className="value">{score}</span>
          <span className="unit">/ 100</span>
        </div>
        <div className="score-summary">
          <span className={`status status-${sc.result}`}>{RESULT_LABEL[sc.result]}</span>
          <h2>{scenario?.title ?? 'Practice call'}</h2>
          <p className="muted">{sc.outcome}</p>
          <p className="muted small">
            {attempt.agentName} · {new Date(attempt.startedAt).toLocaleString()} ·{' '}
            {Math.floor(attempt.durationSec / 60)}m {attempt.durationSec % 60}s
          </p>
        </div>
        <div className="score-actions">
          <button className="primary" onClick={onRetry}>
            Try again
          </button>
          <button className="secondary" onClick={onHome}>
            Other scenarios
          </button>
        </div>
      </section>

      <section className="card">
        <h3>Coaching</h3>
        <ul className="coaching">
          {sc.coaching.map((tip, i) => (
            <li key={i}>{tip}</li>
          ))}
        </ul>
        {sc.strengths.length > 0 && (
          <>
            <h4>What went well</h4>
            <ul className="strengths">
              {sc.strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </>
        )}
      </section>

      <div className="score-grid">
        <section className="card">
          <h3>Call flow</h3>
          <ul className="check-list">
            {sc.steps.map((step) => (
              <li key={step.id} className={`check ${step.status}`}>
                <div className="check-head">
                  <strong>{step.label}</strong>
                  <span className="check-status">{STEP_LABEL[step.status]}</span>
                </div>
                <p className="muted small">{step.evidence}</p>
              </li>
            ))}
          </ul>
        </section>

        <div className="stack">
          <section className="card">
            <h3>Compliance</h3>
            <ul className="check-list">
              {sc.compliance.map((c, i) => (
                <li key={i} className={`check ${c.status === 'ok' ? 'done' : 'missed'}`}>
                  <div className="check-head">
                    <strong>{c.rule}</strong>
                    <span className="check-status">{c.status === 'ok' ? '✓ OK' : '✕ Violation'}</span>
                  </div>
                  <p className="muted small">{c.evidence}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <h3>Scenario goals</h3>
            <ul className="check-list">
              {sc.scenario_criteria.map((c, i) => (
                <li key={i} className={`check ${c.met ? 'done' : 'missed'}`}>
                  <div className="check-head">
                    <strong>{c.criterion}</strong>
                    <span className="check-status">{c.met ? '✓ Met' : '✕ Not met'}</span>
                  </div>
                  <p className="muted small">{c.evidence}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <h3>Soft skills</h3>
            <ul className="meters">
              {sc.soft_skills.map((s) => {
                const value = clamp(s.score, 1, 5)
                return (
                  <li key={s.skill}>
                    <div className="meter-head">
                      <span>{s.skill}</span>
                      <span className="meter-value">{value} / 5</span>
                    </div>
                    <div
                      className="meter"
                      role="meter"
                      aria-valuemin={1}
                      aria-valuemax={5}
                      aria-valuenow={value}
                      aria-label={s.skill}
                      title={s.note}
                    >
                      <span style={{ width: `${(value / 5) * 100}%` }} />
                    </div>
                    <p className="muted small">{s.note}</p>
                  </li>
                )
              })}
            </ul>
          </section>
        </div>
      </div>

      <details className="card transcript-details">
        <summary>Full transcript</summary>
        <div className="transcript static">
          {attempt.transcript.map((turn, i) => (
            <div key={i} className={`turn ${turn.speaker}`}>
              <span className="who">{turn.speaker === 'agent' ? 'Agent' : 'Prospect'}</span>
              <p>{turn.text}</p>
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}
