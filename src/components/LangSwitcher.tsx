'use client'
import { useLocale } from '@/lib/useLocale'
import { LOCALES, type Locale } from '@/lib/i18n'

export default function LangSwitcher() {
  const { locale, setLocale } = useLocale()
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {(Object.keys(LOCALES) as Locale[]).map(l => (
        <button
          key={l}
          onClick={() => setLocale(l)}
          title={LOCALES[l]}
          style={{
            background: locale === l ? 'rgba(0,200,122,0.15)' : 'transparent',
            border: `1px solid ${locale === l ? 'rgba(0,200,122,0.4)' : 'var(--border)'}`,
            borderRadius: 6,
            padding: '4px 8px',
            cursor: 'pointer',
            color: locale === l ? 'var(--green)' : 'var(--text-muted)',
            fontFamily: 'var(--font-cond)',
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: 0.3,
            textTransform: 'uppercase',
            transition: 'all 0.15s',
          } as React.CSSProperties}
        >
          {l === 'en' ? 'EN' : 'ES'}
        </button>
      ))}
    </div>
  )
}
