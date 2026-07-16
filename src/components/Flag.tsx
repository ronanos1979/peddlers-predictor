// Renders a country flag as a background-image span from flagcdn.com.
// Flag emoji on Windows don't render as colored flags — this fixes that cross-platform.
// Falls back to the raw emoji text if the country code can't be extracted.

function emojiToCode(emoji: string): string | null {
  const chars = Array.from(emoji || '')

  // Standard regional indicator flag (e.g. 🇫🇷) — exactly 2 regional indicator chars
  if (chars.length === 2) {
    const a = chars[0].codePointAt(0)
    const b = chars[1].codePointAt(0)
    if (!a || !b || a < 0x1F1E6 || a > 0x1F1FF || b < 0x1F1E6 || b > 0x1F1FF) return null
    return String.fromCharCode(a - 0x1F1E6 + 65, b - 0x1F1E6 + 65).toLowerCase()
  }

  // Tag-sequence subdivision flag (🏴󠁧󠁢󠁥󠁮󠁧󠁿 England, 🏴󠁧󠁢󠁳󠁣󠁴󠁿 Scotland, 🏴󠁧󠁢󠁷󠁬󠁳󠁿 Wales)
  // Tag chars sit in U+E0020–U+E007E; decode them to ASCII then map to flagcdn subdivision code.
  if (chars[0] === '🏴') {
    const code = chars
      .filter(c => { const cp = c.codePointAt(0); return cp !== undefined && cp >= 0xE0020 && cp <= 0xE007E })
      .map(c => String.fromCharCode((c.codePointAt(0) ?? 0) - 0xE0000))
      .join('')
    // "gbeng" → "gb-eng",  "gbsct" → "gb-sct",  "gbwls" → "gb-wls"
    if (code.startsWith('gb') && code.length > 2) return `gb-${code.slice(2)}`
  }

  return null
}

export default function Flag({
  emoji,
  size = 20,
  style,
}: {
  emoji: string
  size?: number
  style?: React.CSSProperties
}) {
  const code = emojiToCode(emoji)
  if (!code) return <span>{emoji}</span>
  return (
    <span
      role="img"
      aria-label={emoji}
      style={{
        display: 'inline-block',
        width: size,
        height: Math.round(size * 0.75),
        backgroundImage: `url(https://flagcdn.com/w40/${code}.png)`,
        backgroundSize: 'contain',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
        verticalAlign: 'middle',
        flexShrink: 0,
        ...style,
      }}
    />
  )
}
