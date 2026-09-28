import { useCallback, useEffect, useState } from 'react'
import { ROLE_LABEL, type Me, type Person, type Role } from '../../shared/accounts.ts'
import { deletePerson, inviteLink, listPeople, resetLink, setDisabled, setRole } from '../api.ts'
import { LinkNotice } from './CopyLink.tsx'
import EditPerson from './EditPerson.tsx'

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : 'Never')

// Admins: invite trainers, help people who are locked out, and turn accounts off.
export default function PeopleView({ user }: { user: Me }) {
  const [people, setPeople] = useState<Person[] | null>(null)
  const [filter, setFilter] = useState<Role | 'all'>('all')
  const [notice, setNotice] = useState<{ title: string; text: string; link: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmEmail, setConfirmEmail] = useState('')
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setPeople(await listPeople())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load people.')
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    listPeople().then(
      (list) => !cancelled && setPeople(list),
      (err) => !cancelled && setError(err instanceof Error ? err.message : 'Could not load people.'),
    )
    return () => {
      cancelled = true
    }
  }, [])

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work. Try again.')
    } finally {
      setBusy(null)
    }
  }

  const invite = (role: 'trainer' | 'admin') =>
    run(`invite-${role}`, async () => {
      setNotice({
        title: `Invite link for a new ${role}`,
        text: `Send this link to the new ${role}. They open it and make their own account. It works once and expires in 7 days.`,
        link: await inviteLink(role),
      })
    })

  const reset = (p: Person) =>
    run(p.id, async () => {
      setNotice({
        title: `Reset link for ${p.name}`,
        text: 'Send this link to them. It lets them set a new password, works once, and expires in 7 days.',
        link: await resetLink(p.id),
      })
    })

  const changeRole = (p: Person, role: Role) => {
    const note =
      role === 'admin'
        ? 'Admins can see and change everything.'
        : p.role === 'trainer'
          ? "Their classes stay, but they won't be able to open them. Hand them to another trainer in each class's Settings."
          : ''
    if (!confirm(`Make ${p.name} ${role === 'admin' ? 'an' : 'a'} ${ROLE_LABEL[role].toLowerCase()}? ${note}`)) return
    void run(p.id, async () => {
      await setRole(p.id, role)
      await load()
    })
  }

  const toggle = (p: Person) => {
    if (!p.disabled && !confirm(`Turn off ${p.name}'s account? They are signed out and can't sign in until you turn it back on.`)) {
      return
    }
    return run(p.id, async () => {
      await setDisabled(p.id, !p.disabled)
      await load()
    })
  }

  const shown = people?.filter((p) => filter === 'all' || p.role === filter) ?? []
  const count = (role: Role) => people?.filter((p) => p.role === role).length ?? 0

  return (
    <div className="history">
      <div className="page-head">
        <h1>People</h1>
        <p className="muted">Everyone with a CallCraft account. Agents sign up themselves with a class code.</p>
      </div>

      <div className="card invite-card">
        <div>
          <h2>Add a trainer</h2>
          <p className="muted small">Make an invite link and send it to them. You can also invite another admin.</p>
        </div>
        <div className="card-actions">
          <button className="primary" disabled={!!busy} onClick={() => void invite('trainer')}>
            Invite a trainer
          </button>
          <button className="secondary" disabled={!!busy} onClick={() => void invite('admin')}>
            Invite an admin
          </button>
        </div>
      </div>

      {people?.length === 1 && !notice && (
        <p className="notice">Next step: invite your first trainer. Click "Invite a trainer" and send them the link.</p>
      )}
      {notice && <LinkNotice {...notice} onClose={() => setNotice(null)} />}
      {done && (
        <p className="notice" role="status">
          {done}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <section className="card">
        <div className="section-head">
          <h2>Accounts</h2>
          <label className="agent-filter">
            <span className="small muted">Show</span>
            <select value={filter} onChange={(e) => setFilter(e.target.value as Role | 'all')}>
              <option value="all">Everyone ({people?.length ?? 0})</option>
              <option value="admin">Admins ({count('admin')})</option>
              <option value="trainer">Trainers ({count('trainer')})</option>
              <option value="agent">Agents ({count('agent')})</option>
            </select>
          </label>
        </div>
        {!people ? (
          <p className="muted">Loading…</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Class</th>
                  <th>Last active</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) =>
                  deleting === p.id ? (
                    <tr key={p.id}>
                      <td colSpan={6}>
                        <form
                          className="delete-confirm"
                          onSubmit={(e) => {
                            e.preventDefault()
                            void run(p.id, async () => {
                              const res = await deletePerson(p.id, confirmEmail)
                              setDeleting(null)
                              setConfirmEmail('')
                              setDone(`Deleted ${p.name} and ${res.calls} practice ${res.calls === 1 ? 'call' : 'calls'}.`)
                              await load()
                            })
                          }}
                        >
                          <p>
                            <strong>Delete {p.name} for good?</strong> Their account and every practice call they made
                            are deleted. This can't be undone. Type <code>{p.email}</code> to confirm.
                          </p>
                          <input
                            value={confirmEmail}
                            onChange={(e) => setConfirmEmail(e.target.value)}
                            aria-label="Type their email to confirm"
                            autoComplete="off"
                          />
                          <button
                            className="danger small-button"
                            type="submit"
                            disabled={busy === p.id || confirmEmail.trim().toLowerCase() !== p.email}
                          >
                            Delete for good
                          </button>
                          <button
                            className="link"
                            type="button"
                            onClick={() => {
                              setDeleting(null)
                              setConfirmEmail('')
                            }}
                          >
                            Cancel
                          </button>
                        </form>
                      </td>
                    </tr>
                  ) : editing === p.id ? (
                    <tr key={p.id}>
                      <td colSpan={6}>
                        <EditPerson
                          person={p}
                          onDone={(changed) => {
                            setEditing(null)
                            if (changed) void load()
                          }}
                        />
                      </td>
                    </tr>
                  ) : (
                  <tr key={p.id} className={p.disabled ? 'is-off' : ''}>
                    <td>
                      <strong>{p.name}</strong>
                      {p.id === user.id && <span className="muted small"> (you)</span>}
                      {p.disabled && <span className="status status-fail off-tag">Off</span>}
                    </td>
                    <td>{p.email}</td>
                    <td>
                      {p.id === user.id ? (
                        ROLE_LABEL[p.role]
                      ) : (
                        <select
                          className="small-select"
                          value={p.role}
                          disabled={busy === p.id}
                          aria-label={`Role for ${p.name}`}
                          onChange={(e) => changeRole(p, e.target.value as Role)}
                        >
                          {(['agent', 'trainer', 'admin'] as const).map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABEL[r]}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td>{p.className ?? '–'}</td>
                    <td>{when(p.lastSeenAt)}</td>
                    <td>
                      {p.id !== user.id && (
                        <div className="row-actions">
                          <button className="link" disabled={busy === p.id} onClick={() => setEditing(p.id)}>
                            Edit
                          </button>
                          <button className="secondary small-button" disabled={busy === p.id} onClick={() => void reset(p)}>
                            Reset password
                          </button>
                          <button className="link muted-link" disabled={busy === p.id} onClick={() => void toggle(p)}>
                            {p.disabled ? 'Turn on' : 'Turn off'}
                          </button>
                          <button
                            className="link danger-link"
                            disabled={busy === p.id}
                            onClick={() => {
                              setEditing(null)
                              setConfirmEmail('')
                              setDeleting(p.id)
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
