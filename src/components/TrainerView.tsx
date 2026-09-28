import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { ClassDashboard, ClassInfo } from '../../shared/classes.ts'
import type { Scenario } from '../../shared/scenarios.ts'
import { archiveScenario, createClass, loadDashboard } from '../api.ts'
import { loadTrainerKey, saveTrainerKey, type Attempt } from '../history.ts'
import AttemptTables from './AttemptTables.tsx'
import CallerAvatar from './CallerAvatar.tsx'

interface Props {
  onOpen: (attempt: Attempt) => void
}

export type TrainerSection = 'results' | 'scenarios'

interface ClassPanelProps extends Props {
  initialSection: TrainerSection
  onBuild: (trainerKey: string, classInfo: ClassInfo, scenario: Scenario | null) => void
  onTry: (scenario: Scenario, classInfo: ClassInfo) => void
}


function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className="secondary small-button"
      onClick={() => {
        navigator.clipboard?.writeText(value).then(
          () => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          },
          () => undefined,
        )
      }}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function ClassSetup({ onKey }: { onKey: (key: string, created?: string) => void }) {
  const [key, setKey] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { trainerKey } = await createClass(name)
      onKey(trainerKey, trainerKey)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the class.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="setup-grid">
      <form
        className="card setup-card"
        onSubmit={(e) => {
          e.preventDefault()
          onKey(key.trim())
        }}
      >
        <h2>Open your class</h2>
        <p className="muted small">Enter the trainer key you got when you created the class.</p>
        <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="Trainer key" autoComplete="off" />
        <button className="primary" type="submit" disabled={!key.trim()}>
          Open dashboard
        </button>
      </form>

      <form className="card setup-card" onSubmit={create}>
        <h2>Create a class</h2>
        <p className="muted small">
          For example, one certification class. You'll get a class code for agents and a private trainer key.
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. October certification, group B"
          maxLength={120}
        />
        <button className="primary" type="submit" disabled={!name.trim() || busy}>
          {busy ? 'Creating…' : 'Create class'}
        </button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>
    </div>
  )
}

function ClassPanel({ onOpen, initialSection, onBuild, onTry }: ClassPanelProps) {
  const [trainerKey, setTrainerKey] = useState(loadTrainerKey)
  const [newKey, setNewKey] = useState<string | null>(null)
  const [dashboard, setDashboard] = useState<ClassDashboard | null>(null)
  const [loading, setLoading] = useState(() => !!trainerKey)
  const [error, setError] = useState<string | null>(null)
  const [agent, setAgent] = useState('all')
  const [section, setSection] = useState<TrainerSection>(initialSection)

  const refresh = useCallback(async (key: string) => {
    setLoading(true)
    setError(null)
    try {
      setDashboard(await loadDashboard(key))
    } catch (err) {
      setDashboard(null)
      setError(err instanceof Error ? err.message : 'Could not load the class.')
    } finally {
      setLoading(false)
    }
  }, [])

  // Load the dashboard whenever the trainer key changes.
  useEffect(() => {
    if (!trainerKey) return
    let cancelled = false
    loadDashboard(trainerKey).then(
      (data) => {
        if (cancelled) return
        setDashboard(data)
        setError(null)
        setLoading(false)
      },
      (err) => {
        if (cancelled) return
        setDashboard(null)
        setError(err instanceof Error ? err.message : 'Could not load the class.')
        setLoading(false)
      },
    )
    return () => {
      cancelled = true
    }
  }, [trainerKey])

  const forget = () => {
    saveTrainerKey(null)
    setTrainerKey('')
    setDashboard(null)
    setNewKey(null)
    setError(null)
  }

  if (!trainerKey) {
    return (
      <ClassSetup
        onKey={(key, created) => {
          saveTrainerKey(key)
          setNewKey(created ?? null)
          setLoading(true)
          setTrainerKey(key)
        }}
      />
    )
  }

  if (!dashboard) {
    return (
      <div className="card">
        {loading ? (
          <p className="muted">Loading class…</p>
        ) : (
          <>
            <p className="error" role="alert">
              {error}
            </p>
            <div className="composer-actions">
              <button className="secondary" onClick={forget}>
                Use a different key
              </button>
              <button className="primary" onClick={() => void refresh(trainerKey)}>
                Try again
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  const { classInfo, attempts } = dashboard
  const agents = [...new Set(attempts.map((a) => a.agentName))].sort()
  const shown = agent === 'all' ? attempts : attempts.filter((a) => a.agentName === agent)

  return (
    <>
      {newKey && (
        <div className="card key-card" role="status">
          <h2>Class created. Save your trainer key now.</h2>
          <p className="small">
            This key opens the dashboard and is shown only once. Anyone with it can see this class's calls, so keep it
            private.
          </p>
          <div className="key-row">
            <code>{newKey}</code>
            <CopyButton value={newKey} />
          </div>
        </div>
      )}

      <div className="card class-summary">
        <div>
          <p className="eyebrow">Class</p>
          <h2>{classInfo.name}</h2>
          <div className="key-row">
            <span className="muted small">Class code for agents:</span>
            <code className="class-code">{classInfo.classCode}</code>
            <CopyButton value={classInfo.classCode} />
          </div>
        </div>
        <div className="history-filters">
          <button className="secondary" onClick={() => void refresh(trainerKey)} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button className="link" onClick={forget}>
            Switch class
          </button>
        </div>
      </div>

      <div className="tabs big-tabs" role="tablist">
        <button role="tab" aria-selected={section === 'results'} onClick={() => setSection('results')}>
          Results
        </button>
        <button role="tab" aria-selected={section === 'scenarios'} onClick={() => setSection('scenarios')}>
          Scenarios ({dashboard.scenarios.filter((s) => !s.archived).length})
        </button>
      </div>

      {section === 'scenarios' ? (
        <ScenariosPanel
          dashboard={dashboard}
          trainerKey={trainerKey}
          onChanged={(updated) =>
            setDashboard({
              ...dashboard,
              scenarios: dashboard.scenarios.map((s) => (s.id === updated.id ? updated : s)),
            })
          }
          onBuild={(scenario) => onBuild(trainerKey, classInfo, scenario)}
          onTry={(scenario) => onTry(scenario, classInfo)}
        />
      ) : shown.length === 0 && agent === 'all' ? (
        <p className="card empty">
          No scored calls yet. Give agents the class code {classInfo.classCode}. They type it on the Practice page.
        </p>
      ) : (
        <>
          <label className="agent-filter">
            <span className="small muted">Show</span>
            <select value={agent} onChange={(e) => setAgent(e.target.value)}>
              <option value="all">All agents ({agents.length})</option>
              {agents.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <AttemptTables
            attempts={shown}
            onOpen={onOpen}
            showAgents={agent === 'all'}
            customScenarios={dashboard.scenarios}
          />
        </>
      )}
    </>
  )
}

function ScenariosPanel({
  dashboard,
  trainerKey,
  onChanged,
  onBuild,
  onTry,
}: {
  dashboard: ClassDashboard
  trainerKey: string
  onChanged: (scenario: Scenario) => void
  onBuild: (scenario: Scenario | null) => void
  onTry: (scenario: Scenario) => void
}) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const toggleHidden = async (scenario: Scenario) => {
    setBusyId(scenario.id)
    setError(null)
    try {
      onChanged(await archiveScenario(trainerKey, scenario.id, !scenario.archived))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the scenario.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <div className="card scenarios-intro">
        <div>
          <h2>Your scenarios</h2>
          <p className="muted">
            Make practice calls for your class. Agents in {dashboard.classInfo.name} see them next to the built-in
            ones.
          </p>
        </div>
        <button className="primary big" onClick={() => onBuild(null)}>
          + New scenario
        </button>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {dashboard.scenarios.length === 0 ? (
        <p className="card empty">No scenarios yet. Click "+ New scenario" to make your first one.</p>
      ) : (
        <div className="scenario-grid">
          {dashboard.scenarios.map((s) => {
            const runs = dashboard.attempts.filter((a) => a.scenarioId === s.id)
            const avg = runs.length
              ? Math.round(runs.reduce((n, a) => n + a.scorecard.overall_score, 0) / runs.length)
              : null
            return (
              <article key={s.id} className={`card scenario-card ${s.archived ? 'is-hidden' : ''}`}>
                <div className="scenario-head">
                  <h3>{s.title}</h3>
                  <span className={`pill difficulty-${s.difficulty.toLowerCase()}`}>{s.difficulty}</span>
                </div>
                <div className="caller">
                  <CallerAvatar name={s.leadName} size="sm" />
                  <span>{s.leadName}</span>
                </div>
                <p>{s.focus}</p>
                <p className="muted small">
                  {s.archived ? 'Hidden from agents · ' : ''}
                  {runs.length} {runs.length === 1 ? 'call' : 'calls'}
                  {avg !== null ? ` · average score ${avg}` : ''}
                </p>
                <div className="card-actions">
                  <button className="secondary" onClick={() => onBuild(s)}>
                    Edit
                  </button>
                  <button className="secondary" onClick={() => onTry(s)}>
                    Try it
                  </button>
                  <button className="link" onClick={() => void toggleHidden(s)} disabled={busyId === s.id}>
                    {s.archived ? 'Show to agents' : 'Hide from agents'}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </>
  )
}

export default function TrainerView({ onOpen, initialSection, onBuild, onTry }: ClassPanelProps) {
  return (
    <div className="history">
      <div className="page-head with-photo">
        <div>
          <h1>Trainer</h1>
          <p className="muted">See how your class is doing and make practice calls for them.</p>
        </div>
        <img className="head-photo" src="/photos/agents-team.webp" alt="" width={800} height={1199} />
      </div>
      <ClassPanel onOpen={onOpen} initialSection={initialSection} onBuild={onBuild} onTry={onTry} />
    </div>
  )
}
