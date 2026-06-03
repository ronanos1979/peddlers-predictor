// Renders a country flag emoji as an <img> from flagcdn.com.
// Flag emoji on Windows don't render as colored flag images — this fixes that.
// Falls back to rendering the raw emoji text if the code can't be extracted.

function emojiToCode(emoji: string): string | null {
  const chars = Array.from(emoji || '')
  if (chars.length !== 2) return null
  const a = chars[0].codePointAt(0)
  const b = chars[1].codePointAt(0)
  if (!a || !b || a < 0x1F1E6 || a > 0x1F1FF || b < 0x1F1E6 || b > 0x1F1FF) return null
  return String.fromCharCode(a - 0x1F1E6 + 65, b - 0x1F1E6 + 65).toLowerCase()
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
    <img
      src={`https://flagcdn.com/w${size}/${code}.png`}
      srcSet={`https://flagcdn.com/w${size * 2}/${code}.png 2x`}
      alt={emoji}
      width={size}
      style={{ display: 'inline-block', verticalAlign: 'middle', objectFit: 'contain', ...style }}
    />
  )
}
