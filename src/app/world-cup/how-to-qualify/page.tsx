'use client'
import Link from 'next/link'
import { useLocale } from '@/lib/useLocale'

export default function HowToQualifyPage() {
  const { t } = useLocale()

  return (
    <div className="container" style={{ paddingBottom: 40 }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--green)', marginBottom: 4 }}>
          FIFA World Cup 2026
        </div>
        <h1 style={{ marginBottom: 6 }}>{t.howToQualifyTitle}</h1>
        <p className="muted">{t.howToQualifySub}</p>
      </div>

      {/* Tournament Format */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--green)', marginBottom: 8 }}>
          {t.htqFormatTitle}
        </div>
        <p style={{ margin: 0, lineHeight: 1.6 }}>{t.htqFormatBody}</p>
      </div>

      {/* Advancing from Group Stage */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--green)', marginBottom: 8 }}>
          {t.htqGroupStageTitle}
        </div>
        <p style={{ margin: '0 0 12px', lineHeight: 1.6 }}>{t.htqGroupStageBody}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { n: '48', label: t.htqFormatTitle.split(' ')[0] === 'Tournament' ? 'Teams' : 'Equipos' },
            { n: '12', label: t.htqFormatTitle.split(' ')[0] === 'Tournament' ? 'Groups' : 'Grupos' },
            { n: '32', label: t.htqFormatTitle.split(' ')[0] === 'Tournament' ? 'Advance' : 'Clasifican' },
          ].map(({ n, label }) => (
            <div key={n} style={{ flex: '1 1 80px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 8px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, color: 'var(--green)', letterSpacing: 1 }}>{n}</div>
              <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Best Third-Placed Teams */}
      <div className="card" style={{ marginBottom: 12, borderColor: 'rgba(245,197,24,0.3)' }}>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 8 }}>
          {t.htqBestThirdTitle}
        </div>
        <p style={{ margin: 0, lineHeight: 1.6 }}>{t.htqBestThirdBody}</p>
      </div>

      {/* Points System */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--green)', marginBottom: 10 }}>
          {t.htqPointsTitle}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { label: t.htqWin, color: 'var(--green)' },
            { label: t.htqDraw, color: 'var(--gold)' },
            { label: t.htqLoss, color: 'var(--text-muted)' },
          ].map(({ label, color }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ fontFamily: 'var(--font-cond)', fontWeight: 700, fontSize: 15 }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tiebreakers */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--green)', marginBottom: 8 }}>
          {t.htqTiebreakerTitle}
        </div>
        <p style={{ margin: '0 0 12px', color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5 }}>{t.htqTiebreakerIntro}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[t.htqTb1, t.htqTb2, t.htqTb3, t.htqTb4, t.htqTb5, t.htqTb6, t.htqTb7].map((tb, i) => (
            <div key={i} style={{ padding: '8px 12px', background: 'var(--surface2)', borderRadius: 6, fontFamily: 'var(--font-cond)', fontSize: 14, lineHeight: 1.4 }}>
              {tb}
            </div>
          ))}
        </div>
      </div>

      {/* Knockout Rounds */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--green)', marginBottom: 8 }}>
          {t.htqKnockoutTitle}
        </div>
        <p style={{ margin: 0, lineHeight: 1.6 }}>{t.htqKnockoutBody}</p>
      </div>

      {/* Extra Time & Penalties */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--green)', marginBottom: 8 }}>
          {t.htqExtraTimeTitle}
        </div>
        <p style={{ margin: 0, lineHeight: 1.6 }}>{t.htqExtraTimeBody}</p>
      </div>

      <Link href="/world-cup" className="btn btn-secondary" style={{ textDecoration: 'none', textAlign: 'center', display: 'block' }}>
        {t.htqBackLink}
      </Link>
    </div>
  )
}
