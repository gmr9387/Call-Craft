import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  checkSystem,
  exportEverything,
  saveLimits,
  saveRetention,
  systemStatus,
  type Check,
  type SpendingLimits,
  type SystemStatus,
} from '../api.ts'
import { downloadCsv, downloadFile } from '../csv.ts'

const ago = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  return min < 1 ? 'just now' : min < 60 ? `${min} min ago` : `${Math.round(min / 60)} h ago`
}

const LIMIT_FIELDS: { key: keyof SpendingLimits; label: string; help: string }[] = [
  {
    key: 'dailyTotal',
    label: 'AI requests per day (whole site)',
    help: 'The main budget cap. A practice call uses about 10–20 requests, so 1,500 covers roughly 75–150 calls a day.',
  },
  {
    key: 'perClientHourly',
    label: 'AI requests per person, per hour',
    help: 'Stops one person (or a stuck browser) from using up the day. 120 is about 6–12 calls an hour.',
  },
  {
    key: 'draftsPerClassDaily',
    label: '"Write it for me" scenario drafts per call flow, per day',
    help: 'Scenario drafts use more AI than a normal reply.',
  },
]

// Admins: is CallCraft healthy, how much AI is it using, and the spending limits.
export default function SystemView() {
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [limits, setLimits] = useState<Record<keyof SpendingLimits, string> | null>(null)
  const [checks, setChecks] = useState<{ ai: Check; database: Check } | null>(null)
  const [retention, setRetention] = useState('0')
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const apply = useCallback((s: SystemStatus) => {
    setStatus(s)
    setRetention(String(s.retentionDays))
    setLimits({
      dailyTotal: String(s.limits.dailyTotal),
      perClientHourly: String(s.limits.perClientHourly),
      draftsPerClassDaily: String(s.limits.draftsPerClassDaily),
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    systemStatus().then(
      (s) => !cancelled && apply(s),
      (err) => !cancelled && setError(err instanceof Error ? err.message : 'Could not load the system status.'),
    )
    return () => {
      cancelled = true
    }
  }, [apply])

  const check = async () => {
    setBusy('check')
    setError(null)
    try {
      setChecks(await checkSystem())
      apply(await systemStatus())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The check did not run.')
    } finally {
      setBusy(null)
    }
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!limits) return
    setBusy('limits')
    setError(null)
    setNotice(null)
    try {
      await saveLimits({
        dailyTotal: Number(limits.dailyTotal),
        perClientHourly: Number(limits.perClientHourly),
        draftsPerClassDaily: Number(limits.draftsPerClassDaily),
      })
      apply(await systemStatus())
      setNotice('Limits saved. They take effect within a minute.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the limits.')
    } finally {
      setBusy(null)
    }
  }

  const saveKeep = async (e: FormEvent) => {
    e.preventDefault()
    const days = Number(retention)
    if (days > 0 && !confirm(`Delete practice calls older than ${days} days, now and from now on?`)) return
    setBusy('retention')
    setError(null)
    setNotice(null)
    try {
      const res = await saveRetention(days)
      apply(await systemStatus())
      setNotice(
        days
          ? `Saved. Calls are kept for ${days} days. ${res.deleted} older ${res.deleted === 1 ? 'call was' : 'calls were'} deleted.`
          : 'Saved. Calls are kept until someone deletes them.',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setBusy(null)
    }
  }

  const backup = async () => {
    setBusy('export')
    setError(null)
    try {
      const data = await exportEverything()
      downloadFile(
        `callcraft-backup-${new Date().toISOString().slice(0, 10)}.json`,
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      )
      apply(await systemStatus())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download the data.')
    } finally {
      setBusy(null)
    }
  }

  if (!status || !limits) {
    return (
      <div className="history">
        <div className="page-head">
          <h1>System</h1>
        </div>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : (
          <p className="card empty">Loading…</p>
        )}
      </div>
    )
  }

  const { usage, counts } = status
  const usedToday = usage.today.reply + usage.today.score + usage.today.draft + usage.today.health
  const pct = status.limits.dailyTotal > 0 ? Math.min(100, Math.round((usedToday / status.limits.dailyTotal) * 100)) : 100
  const weekMax = Math.max(1, ...usage.week.map((d) => d.count))

  return (
    <div className="history">
      <div className="page-head">
        <h1>System</h1>
        <p className="muted">Is CallCraft working, how much AI is it using, and how much is it allowed to use.</p>
      </div>

      {status.aiProblem && (
        <div className="card alert-card" role="alert">
          <h2>⚠ The AI had a problem {ago(status.aiProblem.at)}</h2>
          <p>{status.aiProblem.message}</p>
          <p className="small">
            Practice calls fail until this is fixed. Low credit: add credit in the Anthropic console. Rejected key:
            update ANTHROPIC_API_KEY in Vercel and redeploy. Then click "Check now".
          </p>
        </div>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="stat-row five">
        {[
          ['Agents', counts.agents],
          ['Trainers & admins', counts.staff],
          ['Active classes', counts.classes],
          ['Calls scored today', counts.callsToday],
          ['Practiced this week', counts.activeThisWeek],
        ].map(([label, value]) => (
          <div key={label} className="card stat">
            <span className="stat-label">{label}</span>
            <span className="stat-value">{value}</span>
          </div>
        ))}
      </div>

      <div className="settings-grid">
        <section className="card setup-card">
          <h2>AI use today</h2>
          <p>
            <strong>{usedToday.toLocaleString()}</strong> of {status.limits.dailyTotal.toLocaleString()} requests (
            {pct}%)
          </p>
          <div className={`meter ${pct >= 80 ? 'meter-warn' : ''}`} aria-hidden>
            <span style={{ width: `${pct}%` }} />
          </div>
          <p className="muted small">
            Replies {usage.today.reply} · Scores {usage.today.score} · Drafts {usage.today.draft} · Checks{' '}
            {usage.today.health} · Last hour {usage.lastHour}
          </p>
          <div className="week-chart" aria-label="AI requests per day, last 7 days">
            {usage.week.map((d) => (
              <div key={d.day} className="week-bar" title={`${d.day}: ${d.count}`}>
                <span style={{ height: `${Math.round((d.count / weekMax) * 100)}%` }} />
                <small>{new Date(`${d.day}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short' })}</small>
              </div>
            ))}
          </div>
          <p className="muted small">Days reset at midnight UTC.</p>
        </section>

        <section className="card setup-card">
          <h2>Health check</h2>
          <p className="muted small">
            Sends one tiny AI request and checks the database. Replies use <code>{status.models.replies}</code>, scoring
            uses <code>{status.models.scoring}</code>.
          </p>
          {checks && (
            <ul className="check-results">
              <li className={checks.ai.ok ? 'ok' : 'bad'}>
                {checks.ai.ok ? '✓' : '✕'} AI: {checks.ai.detail}
              </li>
              <li className={checks.database.ok ? 'ok' : 'bad'}>
                {checks.database.ok ? '✓' : '✕'} Database: {checks.database.detail}
              </li>
            </ul>
          )}
          <button className="secondary" onClick={() => void check()} disabled={busy === 'check'}>
            {busy === 'check' ? 'Checking…' : 'Check now'}
          </button>
        </section>
      </div>

      <form className="card limits-form" onSubmit={save}>
        <h2>Spending limits</h2>
        <p className="muted small">
          When a limit is reached, people see a friendly message and no AI request is made, so the bill can't run away.
          Set a limit to 0 to pause all practice.
        </p>
        {LIMIT_FIELDS.map((f) => (
          <label key={f.key} className="limit-row">
            <span>
              <strong>{f.label}</strong>
              <small className="muted">{f.help}</small>
            </span>
            <input
              type="number"
              min={0}
              step={1}
              value={limits[f.key]}
              onChange={(e) => setLimits({ ...limits, [f.key]: e.target.value })}
            />
          </label>
        ))}
        <div className="actions-right">
          <button className="primary" type="submit" disabled={busy === 'limits'}>
            {busy === 'limits' ? 'Saving…' : 'Save limits'}
          </button>
        </div>
      </form>

      <form className="card limits-form" onSubmit={saveKeep}>
        <h2>Keeping practice calls</h2>
        <p className="muted small">
          How long to keep practice calls (the words of the call and the scorecard). Older calls are deleted
          automatically. Use 0 to keep them until someone deletes them. To delete one person's data, use People.
        </p>
        <label className="limit-row">
          <span>
            <strong>Keep calls for this many days</strong>
            <small className="muted">At least 30, or 0 for no limit. For example, 365 keeps one year.</small>
          </span>
          <input type="number" min={0} step={1} value={retention} onChange={(e) => setRetention(e.target.value)} />
        </label>
        <div className="actions-right">
          <button
            className="primary"
            type="submit"
            disabled={busy === 'retention' || retention === String(status.retentionDays)}
          >
            {busy === 'retention' ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>

      <section className="card invite-card">
        <div>
          <h2>Download all data</h2>
          <p className="muted small">
            A copy of everything CallCraft keeps (people, classes, call flows, scenarios, every call, and the activity
            log), for a backup or a data request. Passwords are never included. Keep the file somewhere safe.
          </p>
        </div>
        <button className="secondary" onClick={() => void backup()} disabled={busy === 'export'}>
          {busy === 'export' ? 'Preparing…' : '⬇ Download all data'}
        </button>
      </section>

      <section className="card">
        <div className="section-head">
          <h2>Activity</h2>
          {status.activity.length > 0 && (
            <button
              className="secondary"
              onClick={() =>
                downloadCsv(`callcraft-activity-${new Date().toISOString().slice(0, 10)}.csv`, [
                  ['When', 'Who', 'What', 'Details'],
                  ...status.activity.map((e) => [new Date(e.at).toLocaleString(), e.actor, e.action, e.target]),
                ])
              }
            >
              ⬇ Download (spreadsheet)
            </button>
          )}
        </div>
        <p className="muted small">The latest invites, password resets, and changes to people, classes, and settings.</p>
        {status.activity.length === 0 ? (
          <p className="muted">Nothing yet.</p>
        ) : (
          <div className="table-wrap activity-table">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>What</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {status.activity.map((e, i) => (
                  <tr key={`${e.at}-${i}`}>
                    <td>{new Date(e.at).toLocaleString()}</td>
                    <td>{e.actor}</td>
                    <td>{e.action}</td>
                    <td>{e.target}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
