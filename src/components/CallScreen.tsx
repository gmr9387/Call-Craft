import { useEffect, useRef, useState } from 'react'
import { CALL_FLOW, END_MARKERS, type Scenario, type Turn } from '../../shared/scenarios.ts'
import { getProspectReply, scoreCall } from '../api.ts'
import { saveAttempt, type Attempt } from '../history.ts'
import type { ClassInfo } from '../../shared/classes.ts'
import { canListen, canSpeak, createRecognition, speak, stopSpeaking, type Recognition } from '../speech.ts'

interface Props {
  scenario: Scenario
  agentName: string
  classInfo: ClassInfo | null
  // Trainer test call: uses the class for trainer-built scenarios but isn't saved to it.
  preview?: boolean
  onScored: (attempt: Attempt, saveNote: SaveNote) => void
  onCancel: () => void
}

type Phase = 'live' | 'scoring'

export interface SaveNote {
  ok: boolean
  text: string
}

function stripMarkers(text: string): { text: string; ended: string | null } {
  let ended: string | null = null
  let clean = text
  if (clean.includes(END_MARKERS.hangUp)) ended = 'The prospect hung up.'
  if (clean.includes(END_MARKERS.transferred)) ended = 'Transferred to the admissions counselor.'
  for (const marker of Object.values(END_MARKERS)) clean = clean.replaceAll(marker, '')
  return { text: clean.trim(), ended }
}

function formatTime(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}

export default function CallScreen({ scenario, agentName, classInfo, preview = false, onScored, onCancel }: Props) {
  const [transcript, setTranscript] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [waiting, setWaiting] = useState(false)
  const [phase, setPhase] = useState<Phase>('live')
  const [endNote, setEndNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showGuide, setShowGuide] = useState(true)
  const [voiceOut, setVoiceOut] = useState(canSpeak)
  const [listening, setListening] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  const [startedAt] = useState(() => new Date().toISOString())
  const voiceOutRef = useRef(voiceOut)
  const recognition = useRef<Recognition | null>(null)
  const baseInput = useRef('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const callOver = endNote !== null

  useEffect(() => {
    if (callOver) return
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(timer)
  }, [callOver])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [transcript, waiting])

  useEffect(() => {
    if (voiceOutRef.current) speak('Hello?')
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
      const reply = stripMarkers(await getProspectReply(scenario.id, next, classInfo?.classCode))
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
      const name = agentName.trim()
      const result = await scoreCall(scenario.id, transcript, {
        classCode: classInfo?.classCode,
        saveToClass: !!classInfo && !preview,
        agentName: name,
        startedAt,
        durationSec: elapsed,
      })
      const attempt: Attempt = {
        id: result.attemptId ?? crypto.randomUUID(),
        agentName: name,
        scenarioId: scenario.id,
        scenarioTitle: scenario.title,
        startedAt,
        durationSec: elapsed,
        transcript,
        scorecard: result.scorecard,
      }
      if (!preview) saveAttempt(attempt)
      const note: SaveNote = preview
        ? { ok: true, text: "Preview call: not saved to the class or this device's history." }
        : !classInfo
          ? { ok: true, text: 'Saved on this device. Join a class to share results with your trainer.' }
          : result.saved
            ? { ok: true, text: `Saved to ${classInfo.name}. Your trainer can see this call.` }
            : { ok: false, text: result.saveError ?? "This call wasn't saved to your class." }
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
          <div>
            <p className="eyebrow">
              {preview ? 'Trainer preview' : 'Outbound call'} · {scenario.title}
            </p>
            <h2>
              Calling {scenario.leadName}
              <span className={`status-dot ${callOver ? 'ended' : 'live'}`} aria-hidden />
            </h2>
            <p className="muted small">
              {scenario.program} · {callOver ? 'Call ended' : 'Connected'} · {formatTime(elapsed)}
            </p>
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
            <span className="who">{scenario.leadName.split(' ')[0]}?</span>
            <p>Hello?</p>
          </div>
          {transcript.map((turn, i) => (
            <div key={i} className={`turn ${turn.speaker}`}>
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
                  ? `Open the call, e.g. "Hi, this is ${agentName || 'your name'} calling from…"`
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
          </div>
        ) : (
          <div className="composer-actions end-actions">
            <button className="secondary" onClick={onCancel} disabled={phase === 'scoring'}>
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
            {CALL_FLOW.map((step) => (
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
