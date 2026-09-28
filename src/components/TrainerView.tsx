import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { ClassDashboard } from '../../shared/classes.ts'
import { createClass, loadDashboard } from '../api.ts'
import { clearAttempts, loadAttempts, loadTrainerKey, saveTrainerKey, type Attempt } from '../history.ts'
import AttemptTables from './AttemptTables.tsx'

interface Props {
  onOpen: (attempt: Attempt) => void
}

type Tab = 'class' | 'device'

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

function ClassPanel({ onOpen }: Props) {
  const [trainerKey, setTrainerKey] = useState(loadTrainerKey)
  const [newKey, setNewKey] = useState<string | null>(null)
  const [dashboard, setDashboard] = useState<ClassDashboard | null>(null)
  const [loading, setLoading] = useState(() => !!trainerKey)
  const [error, setError] = useState<string | null>(null)
  const [agent, setAgent] = useState('all')

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
          <label>
            <span className="small muted">Agent</span>
            <select value={agent} onChange={(e) => setAgent(e.target.value)}>
              <option value="all">All agents ({agents.length})</option>
              {agents.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <button className="secondary" onClick={() => void refresh(trainerKey)} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button className="link" onClick={forget}>
            Switch class
          </button>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="card empty">
          No scored calls yet. Share the class code {classInfo.classCode}; agents enter it on the Practice page.
        </p>
      ) : (
        <AttemptTables attempts={shown} onOpen={onOpen} showAgents={agent === 'all'} />
      )}
    </>
  )
}

function DevicePanel({ onOpen }: Props) {
  const [attempts, setAttempts] = useState(loadAttempts)

  if (attempts.length === 0) {
    return <p className="card empty">No practice calls on this device yet. Finish and score a call to see it here.</p>
  }
  return (
    <>
      <div className="composer-actions">
        <button
          className="secondary"
          onClick={() => {
            if (confirm('Delete all practice calls saved on this device? Calls saved to a class are not affected.')) {
              clearAttempts()
              setAttempts([])
            }
          }}
        >
          Clear this device
        </button>
      </div>
      <AttemptTables attempts={attempts} onOpen={onOpen} />
    </>
  )
}

export default function TrainerView({ onOpen }: Props) {
  const [tab, setTab] = useState<Tab>('class')

  return (
    <div className="history">
      <div className="history-head">
        <div>
          <h1>Trainer view</h1>
          <p className="muted">See every scored call from a class, or just the calls made on this device.</p>
        </div>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'class'} onClick={() => setTab('class')}>
            Class dashboard
          </button>
          <button role="tab" aria-selected={tab === 'device'} onClick={() => setTab('device')}>
            This device
          </button>
        </div>
      </div>
      {tab === 'class' ? <ClassPanel onOpen={onOpen} /> : <DevicePanel onOpen={onOpen} />}
    </div>
  )
}
