import { useState, type FormEvent } from 'react'
import { updatePerson } from '../api.ts'

// Inline form to fix someone's name or email.
export default function EditPerson({
  person,
  onDone,
}: {
  person: { id: string; name: string; email: string }
  onDone: (changed: boolean) => void
}) {
  const [name, setName] = useState(person.name)
  const [email, setEmail] = useState(person.email)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await updatePerson(person.id, name, email)
      onDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
      setBusy(false)
    }
  }

  return (
    <form className="inline-edit" onSubmit={save}>
      <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" maxLength={120} required />
      <input value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" type="email" required />
      <button className="primary small-button" type="submit" disabled={busy}>
        Save
      </button>
      <button className="link" type="button" onClick={() => onDone(false)}>
        Cancel
      </button>
      {error && (
        <span className="error small" role="alert">
          {error}
        </span>
      )}
    </form>
  )
}
