import { useState } from 'react'
import { clearAttempts, loadAttempts, type Attempt } from '../history.ts'
import AttemptTables from './AttemptTables.tsx'

interface Props {
  onOpen: (attempt: Attempt) => void
}

export default function MyCalls({ onOpen }: Props) {
  const [attempts, setAttempts] = useState(loadAttempts)

  return (
    <div className="history">
      <div className="page-head">
        <h1>My calls</h1>
        <p className="muted">Every practice call you've scored on this computer.</p>
      </div>
      {attempts.length === 0 ? (
        <p className="card empty">No calls yet. Finish a practice call and it shows up here.</p>
      ) : (
        <>
          <AttemptTables attempts={attempts} onOpen={onOpen} />
          <div className="actions-right">
            <button
              className="link muted-link"
              onClick={() => {
                if (confirm('Delete your call history on this computer? Calls saved to a class stay there.')) {
                  clearAttempts()
                  setAttempts([])
                }
              }}
            >
              Clear my history
            </button>
          </div>
        </>
      )}
    </div>
  )
}
