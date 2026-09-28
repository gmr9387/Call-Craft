import { useState, type FormEvent } from 'react'
import { MIN_PASSWORD, ROLE_LABEL, type Me } from '../../shared/accounts.ts'
import { changePassword } from '../api.ts'

export default function AccountView({ user }: { user: Me }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      await changePassword(current, next)
      setCurrent('')
      setNext('')
      setMessage({ ok: true, text: 'Password changed.' })
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Could not change your password.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="history">
      <div className="page-head">
        <h1>Account</h1>
      </div>
      <section className="card account-card">
        <dl className="account-facts">
          <dt>Name</dt>
          <dd>{user.name}</dd>
          <dt>Email</dt>
          <dd>{user.email}</dd>
          <dt>Role</dt>
          <dd>{ROLE_LABEL[user.role]}</dd>
          {user.role === 'agent' && (
            <>
              <dt>Class</dt>
              <dd>{user.classInfo?.name ?? 'Not in a class'}</dd>
            </>
          )}
        </dl>
      </section>
      <form className="card account-card auth-form" onSubmit={save}>
        <h2>Change password</h2>
        <label className="auth-field">
          <span>Current password</span>
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
        </label>
        <label className="auth-field">
          <span>New password</span>
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            minLength={MIN_PASSWORD}
            required
          />
          <span className="muted small">At least {MIN_PASSWORD} characters.</span>
        </label>
        {message && (
          <p className={message.ok ? 'notice' : 'error'} role={message.ok ? 'status' : 'alert'}>
            {message.text}
          </p>
        )}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Change password'}
        </button>
      </form>
    </div>
  )
}
