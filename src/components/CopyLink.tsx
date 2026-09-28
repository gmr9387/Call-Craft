import { useState } from 'react'

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
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
      {copied ? 'Copied' : label}
    </button>
  )
}

// A one-time link to hand to someone (invite or password reset).
export function LinkNotice({ title, text, link, onClose }: { title: string; text: string; link: string; onClose: () => void }) {
  return (
    <div className="card key-card" role="status">
      <div className="section-head">
        <h2>{title}</h2>
        <button className="link" onClick={onClose}>
          Done
        </button>
      </div>
      <p className="small">{text}</p>
      <div className="key-row">
        <code>{link}</code>
        <CopyButton value={link} label="Copy link" />
      </div>
    </div>
  )
}
