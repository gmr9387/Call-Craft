import type { Attempt } from '../history.ts'
import { useMyCalls } from '../useMyCalls.ts'
import AttemptTables from './AttemptTables.tsx'

interface Props {
  onOpen: (attempt: Attempt) => void
}

export default function MyCalls({ onOpen }: Props) {
  const { attempts, error } = useMyCalls()

  return (
    <div className="history">
      <div className="page-head">
        <h1>My calls</h1>
        <p className="muted">Every practice call you've scored, on any computer.</p>
      </div>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : !attempts ? (
        <p className="card empty">Loading your calls…</p>
      ) : attempts.length === 0 ? (
        <p className="card empty">No calls yet. Finish a practice call and it shows up here.</p>
      ) : (
        <>
          <AttemptTables attempts={attempts} onOpen={onOpen} />
          {attempts.length >= 300 && <p className="muted small">Showing your latest 300 calls.</p>}
        </>
      )}
    </div>
  )
}
