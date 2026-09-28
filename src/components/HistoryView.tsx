import { useMemo, useState } from 'react'
import { SCENARIOS, getScenario } from '../../shared/scenarios.ts'
import { clearAttempts, loadAttempts, type Attempt } from '../history.ts'

interface Props {
  onOpen: (attempt: Attempt) => void
}

const RESULT_LABEL = { pass: '✓ Pass', needs_work: '! Needs work', fail: '✕ Fail' } as const

export default function HistoryView({ onOpen }: Props) {
  const [attempts, setAttempts] = useState(loadAttempts)
  const [agent, setAgent] = useState('all')

  const agents = useMemo(() => [...new Set(attempts.map((a) => a.agentName))].sort(), [attempts])
  const shown = agent === 'all' ? attempts : attempts.filter((a) => a.agentName === agent)

  const byScenario = SCENARIOS.map((s) => {
    const runs = shown.filter((a) => a.scenarioId === s.id)
    const avg = runs.length ? Math.round(runs.reduce((n, a) => n + a.scorecard.overall_score, 0) / runs.length) : null
    const passes = runs.filter((a) => a.scorecard.result === 'pass').length
    return { scenario: s, runs: runs.length, avg, passes }
  })

  return (
    <div className="history">
      <div className="history-head">
        <div>
          <h1>Trainer view</h1>
          <p className="muted">
            Practice results saved in this browser. A pilot version would sync these across a training class.
          </p>
        </div>
        <div className="history-filters">
          <label>
            <span className="small muted">Agent</span>
            <select value={agent} onChange={(e) => setAgent(e.target.value)}>
              <option value="all">All agents</option>
              {agents.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          {attempts.length > 0 && (
            <button
              className="secondary"
              onClick={() => {
                if (confirm('Delete all saved practice calls in this browser?')) {
                  clearAttempts()
                  setAttempts([])
                }
              }}
            >
              Clear history
            </button>
          )}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="card empty">No practice calls yet. Finish and score a call to see it here.</p>
      ) : (
        <>
          <div className="table-wrap card">
            <table>
              <caption>By scenario</caption>
              <thead>
                <tr>
                  <th scope="col">Scenario</th>
                  <th scope="col" className="num">Calls</th>
                  <th scope="col" className="num">Avg score</th>
                  <th scope="col" className="num">Passed</th>
                </tr>
              </thead>
              <tbody>
                {byScenario.map((row) => (
                  <tr key={row.scenario.id}>
                    <td>{row.scenario.title}</td>
                    <td className="num">{row.runs}</td>
                    <td className="num">{row.avg ?? '–'}</td>
                    <td className="num">{row.runs ? `${row.passes} / ${row.runs}` : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="table-wrap card">
            <table>
              <caption>All calls</caption>
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Agent</th>
                  <th scope="col">Scenario</th>
                  <th scope="col" className="num">Score</th>
                  <th scope="col">Result</th>
                  <th scope="col"><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((a) => (
                  <tr key={a.id}>
                    <td>{new Date(a.startedAt).toLocaleString()}</td>
                    <td>{a.agentName}</td>
                    <td>{getScenario(a.scenarioId)?.title ?? a.scenarioId}</td>
                    <td className="num">{Math.round(a.scorecard.overall_score)}</td>
                    <td>
                      <span className={`status status-${a.scorecard.result}`}>{RESULT_LABEL[a.scorecard.result]}</span>
                    </td>
                    <td>
                      <button className="link" onClick={() => onOpen(a)}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
