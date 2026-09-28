import { useState } from 'react'
import type { CallResult } from '../../shared/classes.ts'
import { reviewCall } from '../api.ts'
import { attemptTitle, resultOf, scoreOf, type Attempt } from '../history.ts'
import type { SaveNote } from './CallScreen.tsx'

interface Props {
  attempt: Attempt
  saveNote?: SaveNote
  backLabel: string
  onRetry?: () => void
  onBack: () => void
  // Trainers and admins can add a note and correct the score.
  canReview?: boolean
  onReviewed?: (attempt: Attempt) => void
}

const RESULT_LABEL = { pass: '✓ Pass', needs_work: '! Needs work', fail: '✕ Fail' } as const

const STEP_LABEL = {
  done: '✓ Done',
  missed: '✕ Missed',
  out_of_order: '↺ Out of order',
  not_applicable: '– N/A',
} as const

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(n)))
}

export default function ScorecardView({ attempt, saveNote, backLabel, onRetry, onBack, canReview, onReviewed }: Props) {
  const { scorecard: sc } = attempt
  const score = clamp(scoreOf(attempt), 0, 100)
  const result = resultOf(attempt)
  const aiScore = clamp(sc.overall_score, 0, 100)
  const corrected = attempt.review?.score != null || attempt.review?.result != null

  return (
    <div className="scorecard">
      {saveNote && (
        <p className={saveNote.ok ? 'notice' : 'error'} role={saveNote.ok ? 'status' : 'alert'}>
          {saveNote.text}
        </p>
      )}
      <section className="card score-hero">
        <div className="score-number">
          <span className="value">{score}</span>
          <span className="unit">/ 100</span>
          {corrected && <span className="muted small ai-score">AI score: {aiScore}</span>}
        </div>
        <div className="score-summary">
          <span className={`status status-${result}`}>{RESULT_LABEL[result]}</span>
          <h2>{attemptTitle(attempt)}</h2>
          <p className="muted">{sc.outcome}</p>
          <p className="muted small">
            {attempt.agentName} · {new Date(attempt.startedAt).toLocaleString()} ·{' '}
            {Math.floor(attempt.durationSec / 60)}m {attempt.durationSec % 60}s
          </p>
        </div>
        <div className="score-actions">
          {onRetry && (
            <button className="primary" onClick={onRetry}>
              Try again
            </button>
          )}
          <button className="secondary" onClick={onBack}>
            {backLabel}
          </button>
        </div>
      </section>

      {attempt.review && !canReview && <ReviewNote attempt={attempt} />}
      {canReview && onReviewed && <ReviewForm attempt={attempt} onReviewed={onReviewed} />}

      <section className="card">
        <h3>Coaching</h3>
        <ul className="coaching">
          {sc.coaching.map((tip, i) => (
            <li key={i}>{tip}</li>
          ))}
        </ul>
        {sc.strengths.length > 0 && (
          <>
            <h4>What went well</h4>
            <ul className="strengths">
              {sc.strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </>
        )}
      </section>

      <div className="score-grid">
        <section className="card">
          <h3>Call flow</h3>
          <ul className="check-list">
            {sc.steps.map((step) => (
              <li key={step.id} className={`check ${step.status}`}>
                <div className="check-head">
                  <strong>{step.label}</strong>
                  <span className="check-status">{STEP_LABEL[step.status]}</span>
                </div>
                <p className="muted small">{step.evidence}</p>
              </li>
            ))}
          </ul>
        </section>

        <div className="stack">
          <section className="card">
            <h3>Compliance</h3>
            <ul className="check-list">
              {sc.compliance.map((c, i) => (
                <li key={i} className={`check ${c.status === 'ok' ? 'done' : 'missed'}`}>
                  <div className="check-head">
                    <strong>{c.rule}</strong>
                    <span className="check-status">{c.status === 'ok' ? '✓ OK' : '✕ Violation'}</span>
                  </div>
                  <p className="muted small">{c.evidence}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <h3>Scenario goals</h3>
            <ul className="check-list">
              {sc.scenario_criteria.map((c, i) => (
                <li key={i} className={`check ${c.met ? 'done' : 'missed'}`}>
                  <div className="check-head">
                    <strong>{c.criterion}</strong>
                    <span className="check-status">{c.met ? '✓ Met' : '✕ Not met'}</span>
                  </div>
                  <p className="muted small">{c.evidence}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <h3>Soft skills</h3>
            <ul className="meters">
              {sc.soft_skills.map((s) => {
                const value = clamp(s.score, 1, 5)
                return (
                  <li key={s.skill}>
                    <div className="meter-head">
                      <span>{s.skill}</span>
                      <span className="meter-value">{value} / 5</span>
                    </div>
                    <div
                      className="meter"
                      role="meter"
                      aria-valuemin={1}
                      aria-valuemax={5}
                      aria-valuenow={value}
                      aria-label={s.skill}
                      title={s.note}
                    >
                      <span style={{ width: `${(value / 5) * 100}%` }} />
                    </div>
                    <p className="muted small">{s.note}</p>
                  </li>
                )
              })}
            </ul>
          </section>
        </div>
      </div>

      <details className="card transcript-details">
        <summary>Full transcript</summary>
        <div className="transcript static">
          {attempt.transcript.map((turn, i) => (
            <div key={i} className={`turn ${turn.speaker}`}>
              <span className="who">{turn.speaker === 'agent' ? 'Agent' : 'Prospect'}</span>
              <p>{turn.text}</p>
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}

// What the agent sees: their trainer's note and any corrected score.
function ReviewNote({ attempt }: { attempt: Attempt }) {
  const review = attempt.review!
  return (
    <section className="card review-card">
      <h3>Note from {review.by ?? 'your trainer'}</h3>
      {review.note && <p className="review-text">{review.note}</p>}
      {(review.score !== null || review.result !== null) && (
        <p className="muted small">
          Your trainer corrected this call's score
          {review.score !== null && ` to ${review.score}`}
          {review.result !== null && ` (${RESULT_LABEL[review.result]})`}. The AI gave{' '}
          {Math.round(attempt.scorecard.overall_score)}.
        </p>
      )}
    </section>
  )
}

// Trainers: a note for the agent, and optionally a corrected score and result.
function ReviewForm({ attempt, onReviewed }: { attempt: Attempt; onReviewed: (attempt: Attempt) => void }) {
  const [note, setNote] = useState(attempt.review?.note ?? '')
  const [score, setScore] = useState(attempt.review?.score?.toString() ?? '')
  const [result, setResult] = useState<CallResult | ''>(attempt.review?.result ?? '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const save = async (clear = false) => {
    setBusy(true)
    setMessage(null)
    try {
      const updated = await reviewCall(
        attempt.id,
        clear
          ? { note: '', score: null, result: null }
          : { note, score: score.trim() === '' ? null : Number(score), result: result || null },
      )
      if (clear) {
        setNote('')
        setScore('')
        setResult('')
      }
      setMessage({ ok: true, text: clear ? 'Review removed.' : 'Saved. The agent sees your note on this call.' })
      onReviewed(updated)
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Could not save the review.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card review-card">
      <h3>Your review</h3>
      <p className="muted small">
        Leave a note for {attempt.agentName}. If the AI got the score wrong, correct it here; corrected scores count
        for "Ready for live calls".
        {attempt.review?.by && ` Last reviewed by ${attempt.review.by}.`}
      </p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="Example: Great opening. Next time, give the recording disclosure before any questions."
        aria-label="Note for the agent"
      />
      <div className="review-fields">
        <label className="inline-field">
          <span>Corrected score</span>
          <input
            type="number"
            min={0}
            max={100}
            value={score}
            onChange={(e) => setScore(e.target.value)}
            placeholder={String(Math.round(attempt.scorecard.overall_score))}
          />
        </label>
        <label className="inline-field">
          <span>Result</span>
          <select value={result} onChange={(e) => setResult(e.target.value as CallResult | '')}>
            <option value="">Keep the AI's ({RESULT_LABEL[attempt.scorecard.result]})</option>
            <option value="pass">{RESULT_LABEL.pass}</option>
            <option value="needs_work">{RESULT_LABEL.needs_work}</option>
            <option value="fail">{RESULT_LABEL.fail}</option>
          </select>
        </label>
      </div>
      {message && <p className={message.ok ? 'notice' : 'error'}>{message.text}</p>}
      <div className="card-actions">
        <button className="primary" disabled={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save review'}
        </button>
        {attempt.review && (
          <button className="link muted-link" disabled={busy} onClick={() => void save(true)}>
            Remove review
          </button>
        )}
      </div>
    </section>
  )
}
