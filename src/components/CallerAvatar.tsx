interface Props {
  name: string
  size?: 'sm' | 'md' | 'lg'
}

const TONES = 6

// "Maria Lopez" -> "ML"; one word -> its first letter.
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  const first = words[0][0]
  const last = words.length > 1 ? words[words.length - 1][0] : ''
  return (first + last).toUpperCase()
}

// The same name always gets the same color.
function tone(name: string): number {
  let hash = 0
  for (const ch of name.trim().toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return hash % TONES
}

// A circle with the caller's initials. Decorative: the name is always shown next to it.
export default function CallerAvatar({ name, size = 'md' }: Props) {
  return (
    <span className={`avatar avatar-${size} avatar-tone-${tone(name)}`} aria-hidden>
      {initials(name)}
    </span>
  )
}
