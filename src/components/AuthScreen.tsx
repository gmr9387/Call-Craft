import { useEffect, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react'
import { MIN_PASSWORD, ROLE_LABEL, type LinkInfo, type Me } from '../../shared/accounts.ts'
import { acceptInvite, linkInfo, login, resetPassword, setupAdmin, signUp } from '../api.ts'

export type AuthMode =
  | { kind: 'login' }
  | { kind: 'signup'; classCode?: string }
  | { kind: 'setup' }
  | { kind: 'invite'; token: string }
  | { kind: 'reset'; token: string }

interface Props {
  mode: AuthMode
  onMode: (mode: AuthMode) => void
  onSignedIn: (user: Me) => void
  onHome: () => void
}

function Field({
  label,
  hint,
  ...input
}: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="auth-field">
      <span>{label}</span>
      <input {...input} required />
      {hint && <span className="muted small">{hint}</span>}
    </label>
  )
}

// Name, email, and password: the same three boxes for every new account.
function useAccountFields() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const fields = (
    <>
      <Field label="Your name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={120} placeholder="First and last name" />
      <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      <Field
        label="Make a password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        minLength={MIN_PASSWORD}
        hint={`At least ${MIN_PASSWORD} characters.`}
      />
    </>
  )
  return { values: { name, email, password }, fields }
}

function Form({
  title,
  intro,
  button,
  onSubmit,
  children,
  footer,
}: {
  title: string
  intro?: ReactNode
  button: string
  onSubmit: () => Promise<void>
  children: ReactNode
  footer?: ReactNode
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onSubmit()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
      setBusy(false)
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <h1>{title}</h1>
      {intro && <p className="muted">{intro}</p>}
      {children}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="primary big" type="submit" disabled={busy}>
        {busy ? 'One moment…' : button}
      </button>
      {footer && <div className="auth-footer">{footer}</div>}
    </form>
  )
}

function Login({ onMode, onSignedIn }: Pick<Props, 'onMode' | 'onSignedIn'>) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  return (
    <Form
      title="Sign in"
      button="Sign in"
      onSubmit={async () => onSignedIn((await login(email, password)).user)}
      footer={
        <>
          <p>
            New agent?{' '}
            <button type="button" className="link" onClick={() => onMode({ kind: 'signup' })}>
              Create your account
            </button>
          </p>
          <p className="muted small">Forgot your password? Ask your trainer for a reset link.</p>
        </>
      }
    >
      <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus />
      <Field
        label="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
      />
    </Form>
  )
}

function Signup({ classCode: initialCode, onMode, onSignedIn }: Pick<Props, 'onMode' | 'onSignedIn'> & { classCode?: string }) {
  const [code, setCode] = useState(initialCode ?? '')
  const { values, fields } = useAccountFields()
  return (
    <Form
      title="Create your account"
      intro="For agents in a training class."
      button="Create account"
      onSubmit={async () => onSignedIn((await signUp(code, values)).user)}
      footer={
        <p>
          Already have an account?{' '}
          <button type="button" className="link" onClick={() => onMode({ kind: 'login' })}>
            Sign in
          </button>
        </p>
      }
    >
      <Field
        label="Class code"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="e.g. K7M4QX"
        maxLength={20}
        autoComplete="off"
        hint="Your trainer gives you this."
      />
      {fields}
    </Form>
  )
}

function Setup({ onSignedIn }: Pick<Props, 'onSignedIn'>) {
  const { values, fields } = useAccountFields()
  return (
    <Form
      title="Set up CallCraft"
      intro="Create the first account. It will be the admin: you'll invite trainers, and trainers create classes for agents."
      button="Create admin account"
      onSubmit={async () => onSignedIn((await setupAdmin(values)).user)}
    >
      {fields}
    </Form>
  )
}

// Invite and reset links: check the link first, then show the right form.
function FromLink({ mode, onMode, onSignedIn }: Pick<Props, 'onMode' | 'onSignedIn'> & { mode: { kind: 'invite' | 'reset'; token: string } }) {
  const [link, setLink] = useState<LinkInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { values, fields } = useAccountFields()
  const [password, setPassword] = useState('')

  useEffect(() => {
    let cancelled = false
    linkInfo(mode.token).then(
      (res) => !cancelled && setLink(res.link),
      (err) => !cancelled && setError(err instanceof Error ? err.message : 'This link could not be checked.'),
    )
    return () => {
      cancelled = true
    }
  }, [mode.token])

  if (error || (link && link.kind !== mode.kind)) {
    return (
      <div className="auth-form">
        <h1>This link doesn't work</h1>
        <p className="error" role="alert">
          {error ?? 'This link is for something else.'}
        </p>
        <button className="secondary big" onClick={() => onMode({ kind: 'login' })}>
          Go to sign in
        </button>
      </div>
    )
  }
  if (!link) return <p className="muted auth-form">Checking your link…</p>

  if (link.kind === 'reset') {
    return (
      <Form
        title="Set a new password"
        intro={
          <>
            For <strong>{link.name}</strong> ({link.email}).
          </>
        }
        button="Save password and sign in"
        onSubmit={async () => onSignedIn((await resetPassword(mode.token, password)).user)}
      >
        <Field
          label="New password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={MIN_PASSWORD}
          hint={`At least ${MIN_PASSWORD} characters.`}
        />
      </Form>
    )
  }

  const role = link.role ? ROLE_LABEL[link.role].toLowerCase() : 'trainer'
  return (
    <Form
      title={`You're invited as a ${role}`}
      intro={
        role === 'admin'
          ? 'Admins invite trainers, see every class, and help people who are locked out.'
          : 'Trainers create classes, see how every agent is doing, and make practice calls.'
      }
      button="Create account"
      onSubmit={async () => onSignedIn((await acceptInvite(mode.token, values)).user)}
    >
      {fields}
    </Form>
  )
}

export default function AuthScreen({ mode, onMode, onSignedIn, onHome }: Props) {
  return (
    <div className="auth-page">
      <aside className="auth-side">
        <button className="brand" onClick={onHome}>
          <span className="brand-mark" aria-hidden>
            ◉
          </span>{' '}
          CallCraft
        </button>
        <img src="/photos/marketing-hero.webp" alt="" />
        <p>Practice calls before the real ones.</p>
      </aside>
      <main className="auth-main">
        <div className="card auth-card">
          {mode.kind === 'login' && <Login onMode={onMode} onSignedIn={onSignedIn} />}
          {mode.kind === 'signup' && <Signup classCode={mode.classCode} onMode={onMode} onSignedIn={onSignedIn} />}
          {mode.kind === 'setup' && <Setup onSignedIn={onSignedIn} />}
          {(mode.kind === 'invite' || mode.kind === 'reset') && (
            <FromLink key={mode.token} mode={mode} onMode={onMode} onSignedIn={onSignedIn} />
          )}
        </div>
        <button className="link muted-link" onClick={onHome}>
          ← Back to the home page
        </button>
      </main>
    </div>
  )
}
