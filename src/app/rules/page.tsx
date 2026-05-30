'use client'
import Link from 'next/link'
import { useLocale } from '@/lib/useLocale'

const RULES = {
  en: {
    title: 'Rules & How to Play',
    subtitle: "The Peddler's Daughter World Cup 2026 Predictor",
    prizeTitle: 'The Grand Prize',
    prizeLead: 'One TV per pub - two winners total!',
    prizeBody: 'Drawn by raffle at the end of the World Cup Final on July 19, 2026. The more correct predictions you make, the more raffle tickets you earn.',
    sections: [
      ['📱 How to enter', [
        "Visit The Peddler's Daughter in Haverhill, MA or Nashua, NH during any World Cup match",
        'Scan the QR code at your table or bar, or visit this app on your phone',
        'Select your location - Haverhill or Nashua',
        'Enter your name and phone number',
        'Pick your prediction: Home Win, Draw, or Away Win',
        "Hit Submit - you're in!",
      ]],
      ['✅ Eligibility', [
        "You must be physically present inside The Peddler's Daughter to enter",
        'You must be 21 years of age or older',
        'One prediction per person per match - no changes once submitted',
        'Use the same phone number every time so your picks stay together',
        'Both pubs run separate competitions with separate TV prizes',
        "Staff of The Peddler's Daughter are not eligible to win",
      ]],
      ['🎯 Scoring & raffle entries', [
        'Each correct prediction earns 3 raffle entries toward the TV draw',
        'Incorrect predictions earn 0 entries - but every match is a new chance',
        'The leaderboard shows total raffle entries',
        'You can enter every match across the tournament',
        'There are 104 matches total, giving a maximum of 312 raffle entries per person',
      ]],
      ['⏱️ Timing', [
        'Predictions open at kick-off time for each match',
        'Predictions close approximately 90 minutes after kick-off',
        'No predictions can be made or changed after entries close',
        'Results are confirmed by pub staff after each match',
      ]],
      ['🎲 The TV raffle draw', [
        'The raffle draw takes place after the World Cup Final on July 19, 2026',
        'Each pub holds a separate draw for its own TV prize',
        'Your raffle entries are the total number of correct predictions times 3',
        'If the winner is not present, they will be contacted by phone',
        'Winners have 48 hours to claim their prize',
      ]],
      ['🤝 Fair play', [
        'The daily pub code is required to enter',
        'Entries submitted from outside the pub premises are invalid',
        'Multiple accounts using different phone numbers by the same person are not permitted',
        'Management reserves the right to disqualify entries that violate fair play',
        "Management's decisions are final",
      ]],
      ['🔒 Privacy', [
        'Your phone number and email are used only for winner contact and tournament updates',
        'Your information will not be shared with third parties or used for marketing without your consent',
        'Only your first name and last initial appear publicly on the leaderboard',
      ]],
    ],
    datesTitle: '📅 Tournament dates',
    dates: [
      ['Group stage', 'June 11 - June 27'],
      ['Round of 32', 'June 28 - July 4'],
      ['Round of 16', 'July 4 - July 8'],
      ['Quarter Finals', 'July 10 - July 12'],
      ['Semi Finals', 'July 14 - July 15'],
      ['🏆 World Cup Final', 'July 19, 2026'],
    ],
    viewSchedule: 'View full schedule',
  },
  es: {
    title: 'Reglas y Cómo Jugar',
    subtitle: "Predictor del Mundial 2026 de The Peddler's Daughter",
    prizeTitle: 'El Gran Premio',
    prizeLead: '¡Un televisor por pub - dos ganadores en total!',
    prizeBody: 'Se sortea al final de la Final del Mundial el 19 de julio de 2026. Cuantas más predicciones correctas hagas, más boletos de rifa ganas.',
    sections: [
      ['📱 Cómo participar', [
        "Visita The Peddler's Daughter en Haverhill, MA o Nashua, NH durante cualquier partido del Mundial",
        'Escanea el código QR en tu mesa o en la barra, o abre esta app en tu teléfono',
        'Selecciona tu ubicación - Haverhill o Nashua',
        'Ingresa tu nombre y número de teléfono',
        'Elige tu predicción: gana local, empate o gana visitante',
        'Presiona enviar - ¡ya estás participando!',
      ]],
      ['✅ Elegibilidad', [
        "Debes estar físicamente dentro de The Peddler's Daughter para participar",
        'Debes tener 21 años o más',
        'Una predicción por persona por partido - no se puede cambiar después de enviarla',
        'Usa el mismo número de teléfono cada vez para mantener tus picks juntos',
        'Los dos pubs tienen competencias separadas con premios separados',
        "El personal de The Peddler's Daughter no puede ganar",
      ]],
      ['🎯 Puntuación y boletos de rifa', [
        'Cada predicción correcta gana 3 boletos de rifa para el sorteo del televisor',
        'Las predicciones incorrectas ganan 0 boletos - pero cada partido es una nueva oportunidad',
        'La clasificación muestra el total de boletos de rifa',
        'Puedes participar en todos los partidos del torneo',
        'Hay 104 partidos en total, con un máximo de 312 boletos por persona',
      ]],
      ['⏱️ Horarios', [
        'Las predicciones abren al inicio de cada partido',
        'Las predicciones cierran aproximadamente 90 minutos después del inicio',
        'No se pueden hacer ni cambiar predicciones después del cierre',
        'El personal del pub confirma los resultados después de cada partido',
      ]],
      ['🎲 Sorteo del televisor', [
        'El sorteo se realiza después de la Final del Mundial el 19 de julio de 2026',
        'Cada pub hace un sorteo separado para su propio televisor',
        'Tus boletos son el total de predicciones correctas multiplicado por 3',
        'Si el ganador no está presente, se le contactará por teléfono',
        'Los ganadores tienen 48 horas para reclamar el premio',
      ]],
      ['🤝 Juego justo', [
        'Se requiere el código diario del pub para participar',
        'Las entradas enviadas fuera del pub son inválidas',
        'No se permiten múltiples cuentas con distintos números de teléfono para la misma persona',
        'La gerencia puede descalificar entradas que violen el espíritu de juego justo',
        'Las decisiones de la gerencia son finales',
      ]],
      ['🔒 Privacidad', [
        'Tu teléfono y correo solo se usan para contactar ganadores y enviar actualizaciones del torneo',
        'Tu información no se compartirá con terceros ni se usará para marketing sin tu consentimiento',
        'Solo tu nombre e inicial del apellido aparecen públicamente en la clasificación',
      ]],
    ],
    datesTitle: '📅 Fechas del torneo',
    dates: [
      ['Fase de grupos', '11 de junio - 27 de junio'],
      ['Ronda de 32', '28 de junio - 4 de julio'],
      ['Octavos de final', '4 de julio - 8 de julio'],
      ['Cuartos de final', '10 de julio - 12 de julio'],
      ['Semifinales', '14 de julio - 15 de julio'],
      ['🏆 Final del Mundial', '19 de julio de 2026'],
    ],
    viewSchedule: 'Ver calendario completo',
  },
}

export default function RulesPage() {
  const { locale, t } = useLocale()
  const copy = RULES[locale]

  return (
    <div className="container">
      <div style={{ marginBottom: 24 }}>
        <h1>{copy.title}</h1>
        <p className="muted">{copy.subtitle}</p>
      </div>

      <div className="card" style={{
        background: 'linear-gradient(135deg, #1a1200, #2a1f00)',
        border: '1px solid var(--gold)',
        marginBottom: 24,
        textAlign: 'center',
        padding: '24px 20px'
      }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🏆</div>
        <h2 style={{ color: 'var(--gold)', marginBottom: 6 }}>{copy.prizeTitle}</h2>
        <p style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>{copy.prizeLead}</p>
        <p className="muted" style={{ fontSize: 13 }}>{copy.prizeBody}</p>
      </div>

      {copy.sections.map(([title, items]) => (
        <div key={String(title)} className="rules-section">
          <div className="card">
            <h3 style={{ color: 'var(--green-dark)', marginBottom: 12 }}>{title}</h3>
            <ul className="rules-list">
              {(items as string[]).map(item => <li key={item}>{item}</li>)}
            </ul>
          </div>
        </div>
      ))}

      <div className="card" style={{ background: '#0a1a0a', border: '1px solid #1D9E75' }}>
        <h3 style={{ color: 'var(--green-dark)', marginBottom: 12 }}>{copy.datesTitle}</h3>
        <div style={{ fontSize: 14, lineHeight: 2 }}>
          {copy.dates.map(([label, date], index) => (
            <div key={label} style={{
              display: 'flex', justifyContent: 'space-between',
              borderBottom: index < copy.dates.length - 1 ? '1px solid #222' : 'none',
              paddingBottom: index < copy.dates.length - 1 ? 6 : 0,
              marginBottom: index < copy.dates.length - 1 ? 6 : 0
            }}>
              <span style={{ fontWeight: index === copy.dates.length - 1 ? 600 : 400 }}>{label}</span>
              <span style={{ color: index === copy.dates.length - 1 ? 'var(--gold)' : 'var(--text-muted)', fontWeight: index === copy.dates.length - 1 ? 600 : 400 }}>{date}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
        <Link href="/" className="btn btn-primary" style={{ textDecoration: 'none', textAlign: 'center' }}>
          ← {t.makePrediction}
        </Link>
        <Link href="/schedule" className="btn btn-secondary" style={{ textDecoration: 'none', textAlign: 'center' }}>
          📅 {copy.viewSchedule}
        </Link>
      </div>
    </div>
  )
}
