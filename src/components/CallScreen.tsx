import { useEffect, useRef, useState } from 'react'
import { END_MARKERS, type Scenario, type Turn } from '../../shared/scenarios.ts'
import type { CallFlow } from '../../shared/flows.ts'
import type { ClassInfo } from '../../shared/classes.ts'
import { clearActiveCall, saveActiveCall, type SavedCall } from '../activeCall.ts'
import { getProspectReply, scoreCall } from '../api.ts'
import type { Attempt } from '../history.ts'
import CallerAvatar from './CallerAvatar.tsx'
import { canListen, canSpeak, createRecognition, speak, stopSpeaking, type Recognition } from '../speech.ts'

interface Props {
  scenario: Scenario
  // The call flow for the call guide (the class's flow, or the built-in sample).
  flow: CallFlow
  agentName: string
  userId: string
  // Trainer test call: not saved anywhere. The class is where "back" returns to.
  preview?: ClassInfo
  // An unfinished call to pick back up (after a refresh or crash).
  resume?: SavedCall
  onScored: (attempt: Attempt, saveNote: SaveNote) => void
  onCancel: () => void
}

type Phase = 'live' | 'scoring'

export interface SaveNote {
  ok: boolean
  text: string
}

function stripMarkers(text: string, flow: CallFlow): { text: string; ended: string | null } {
  let ended: string | null = null
  let clean = text
  if (clean.includes(END_MARKERS.hangUp)) ended = 'The prospect hung up.'
  if (clean.includes(END_MARKERS.transferred)) ended = `The call reached its goal: ${flow.endGoal}.`
  for (const marker of Object.values(END_MARKERS)) clean = clean.replaceAll(marker, '')
  return { text: clean.trim(), ended }
}

function formatTime(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}

export default function CallScreen({ scenario, flow, agentName, userId, preview, resume, onScored, onCancel }: Props) {
  const [transcript, setTranscript] = useState<Turn[]>(resume?.transcript ?? [])
  const [input, setInput] = useState('')
  const [waiting, setWaiting] = useState(false)
  const [phase, setPhase] = useState<Phase>('live')
  const [endNote, setEndNote] = useState<string | null>(resume?.endNote ?? null)
  const [error, setError] = useState<string | null>(null)
  const [showGuide, setShowGuide] = useState(true)
  const [voiceOut, setVoiceOut] = useState(canSpeak)
  const [listening, setListening] = useState(false)
  const [elapsed, setElapsed] = useState(resume?.elapsed ?? 0)

  const [startedAt] = useState(() => resume?.startedAt ?? new Date().toISOString())
  const voiceOutRef = useRef(voiceOut)
  const resumed = useRef(!!resume)
  const recognition = useRef<Recognition | null>(null)
  const baseInput = useRef('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const callOver = endNote !== null
  const callerFirst = scenario.leadName.split(' ')[0]

  useEffect(() => {
    if (callOver) return
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(timer)
  }, [callOver])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [transcript, waiting])

  // Keep the call in this browser as it goes, so a refresh or crash doesn't lose it.
  // Saved when the conversation changes, and every 10 seconds for the timer.
  const saveSlot = Math.floor(elapsed / 10)
  useEffect(() => {
    if (transcript.length === 0) return
    // The timer is saved to the nearest 10 seconds, so the call isn't saved every second.
    const savedElapsed = saveSlot * 10
    saveActiveCall({ userId, scenario, flow, preview: preview ?? null, transcript, startedAt, elapsed: savedElapsed, endNote })
  }, [transcript, endNote, saveSlot, userId, scenario, flow, preview, startedAt])

  useEffect(() => {
    if (voiceOutRef.current && !resumed.current) speak('Hello?')
    return () => {
      stopSpeaking()
      recognition.current?.stop()
    }
    // Only greet once when the call connects.
  }, [])

  const stopListening = () => {
    recognition.current?.stop()
    recognition.current = null
    setListening(false)
  }

  const toggleListening = () => {
    if (listening) return stopListening()
    const rec = createRecognition()
    if (!rec) return
    stopSpeaking()
    baseInput.current = input ? input.trimEnd() + ' ' : ''
    rec.onresult = (event) => {
      let text = ''
      for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript
      setInput(baseInput.current + text)
    }
    rec.onerror = (event) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') setError(`Microphone error: ${event.error}`)
    }
    rec.onend = () => setListening(false)
    recognition.current = rec
    rec.start()
    setListening(true)
  }

  const send = async () => {
    const text = input.trim()
    if (!text || waiting || callOver) return
    stopListening()
    setError(null)
    const next: Turn[] = [...transcript, { speaker: 'agent', text }]
    setTranscript(next)
    setInput('')
    setWaiting(true)
    try {
      const reply = stripMarkers(await getProspectReply(scenario.id, next), flow)
      if (reply.text) {
        setTranscript([...next, { speaker: 'prospect', text: reply.text }])
        if (voiceOut) speak(reply.text)
      }
      if (reply.ended) setEndNote(reply.ended)
    } catch (e) {
      // Roll the agent's line back into the box so they can resend it.
      setTranscript(transcript)
      setInput(text)
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setWaiting(false)
    }
  }

  const endCall = () => {
    stopListening()
    stopSpeaking()
    setEndNote((note) => note ?? 'You ended the call.')
  }

  const score = async () => {
    setPhase('scoring')
    setError(null)
    try {
      const result = await scoreCall(scenario.id, transcript, {
        save: !preview,
        startedAt,
        durationSec: elapsed,
      })
      const attempt: Attempt = {
        id: result.attemptId ?? crypto.randomUUID(),
        agentName,
        scenarioId: scenario.id,
        scenarioTitle: scenario.title,
        startedAt,
        durationSec: elapsed,
        transcript,
        scorecard: result.scorecard,
      }
      const note: SaveNote = preview
        ? { ok: true, text: 'Preview call: not saved.' }
        : !result.saved
          ? { ok: false, text: result.saveError ?? "This call wasn't saved." }
          : result.className
            ? { ok: true, text: `Saved to ${result.className}. Your trainer can see this call.` }
            : { ok: true, text: 'Saved to My calls.' }
      clearActiveCall()
      onScored(attempt, note)
    } catch (e) {
      setPhase('live')
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    }
  }

  return (
    <div className="call-layout">
      <section className="card call-panel">
        <div className="call-header">
          <div className="call-who">
            <CallerAvatar name={scenario.leadName} size="lg" />
            <div>
              <p className="eyebrow">
                {preview ? 'Trainer preview' : flow.company} · {scenario.title}
              </p>
              <h2>
                Calling {scenario.leadName}
                <span className={`status-dot ${callOver ? 'ended' : 'live'}`} aria-hidden />
              </h2>
              <p className="muted small">
                {scenario.program} · {callOver ? 'Call ended' : 'Connected'} · {formatTime(elapsed)}
              </p>
            </div>
          </div>
          <div className="call-controls">
            {canSpeak && (
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={voiceOut}
                  onChange={(e) => {
                    setVoiceOut(e.target.checked)
                    voiceOutRef.current = e.target.checked
                    if (!e.target.checked) stopSpeaking()
                  }}
                />
                Prospect voice
              </label>
            )}
            <label className="toggle">
              <input type="checkbox" checked={showGuide} onChange={(e) => setShowGuide(e.target.checked)} />
              Call guide
            </label>
          </div>
        </div>

        <div className="transcript" ref={scrollRef} aria-live="polite">
          <div className="turn prospect">
            <span className="who">{callerFirst}?</span>
            <p>Hello?</p>
          </div>
          {transcript.map((turn, i) => (
            <div key={i} className={`turn ${turn.speaker}`}>
              {/* Neutral label: the person who answers isn't always the lead. */}
              <span className="who">{turn.speaker === 'agent' ? 'You' : 'Prospect'}</span>
              <p>{turn.text}</p>
            </div>
          ))}
          {waiting && (
            <div className="turn prospect">
              <span className="who">Prospect</span>
              <p className="typing" aria-label="Prospect is responding">
                <span />
                <span />
                <span />
              </p>
            </div>
          )}
          {endNote && <p className="end-note">{endNote}</p>}
        </div>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {!callOver ? (
          <div className="composer">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send()
                }
              }}
              placeholder={
                transcript.length === 0
                  ? `Open the call, e.g. "Hi, this is ${agentName || 'your name'} calling from ${flow.company}…"`
                  : 'Say something… (Enter to send, Shift+Enter for a new line)'
              }
              rows={3}
              disabled={waiting}
            />
            <div className="composer-actions">
              {canListen && (
                <button className={`secondary ${listening ? 'recording' : ''}`} onClick={toggleListening}>
                  {listening ? '■ Stop mic' : '🎙 Speak'}
                </button>
              )}
              <button className="primary" onClick={() => void send()} disabled={!input.trim() || waiting}>
                Send
              </button>
              <button className="danger" onClick={endCall} disabled={waiting}>
                End call
              </button>
            </div>
            <p className="muted small practice-only">Practice only: never type real customer information.</p>
          </div>
        ) : (
          <div className="composer-actions end-actions">
            <button
              className="secondary"
              onClick={() => {
                clearActiveCall()
                onCancel()
              }}
              disabled={phase === 'scoring'}
            >
              Discard
            </button>
            <button
              className="primary"
              onClick={() => void score()}
              disabled={phase === 'scoring' || transcript.length === 0}
            >
              {phase === 'scoring' ? 'Scoring your call…' : 'Score my call'}
            </button>
          </div>
        )}
      </section>

      {showGuide && (
        <aside className="card guide">
          <h3>Call guide</h3>
          <p className="muted small">{scenario.focus}</p>
          <ol className="flow-list compact">
            {flow.steps.map((step) => (
              <li key={step.id}>
                <strong>{step.label}</strong>
                <span>{step.guide}</span>
              </li>
            ))}
          </ol>
          <p className="muted small">Turn the guide off for a closer-to-real test.</p>
        </aside>
      )}
    </div>
  )
}
