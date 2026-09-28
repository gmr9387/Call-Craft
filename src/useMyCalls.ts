import { useEffect, useState } from 'react'
import { myCalls } from './api.ts'
import type { Attempt } from './history.ts'

// Loads the signed-in person's calls from the server.
export function useMyCalls(): { attempts: Attempt[] | null; error: string | null } {
  const [attempts, setAttempts] = useState<Attempt[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    myCalls().then(
      (list) => !cancelled && setAttempts(list),
      (err) => !cancelled && setError(err instanceof Error ? err.message : 'Could not load your calls.'),
    )
    return () => {
      cancelled = true
    }
  }, [])
  return { attempts, error }
}
