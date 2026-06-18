'use client'
import Link from 'next/link'
import { useLocale } from '@/lib/useLocale'

const RULES = {
  en: {
    title: 'Rules & How to Play',
    subtitle: "The Peddler's Daughter World Cup 2026 Predictor",
    prizeTitle: 'The Grand Prize',
    prizeLead: 'One TV — one winner across both pubs!',
    prizeBody: 'Drawn by raffle at the end of the World Cup Final on July 19, 2026. All entries from Haverhill and Nashua compete together in one combined draw. Correct result = 1 ticket, exact score = 3 tickets. The more you predict, the better your odds.',
    sections: [
      ['📱 How to enter', [
        "Visit The Peddler's Daughter in Haverhill, MA or Nashua, NH during the World Cup",
        'Scan the QR code at your table or bar, or visit this app on your phone',
        'Select your location - Haverhill or Nashua',
        'Enter your name, phone number, and optionally your email address',
        'Pick your prediction: Home Win, Draw, or Away Win',
        'Optionally predict the exact score for a bonus 2 raffle entries',
        "Hit Submit - you're in!",
      ]],
      ['✅ Eligibility', [
        "You must be physically present inside The Peddler's Daughter to enter",
        'You must be 21 years of age or older',
        'One prediction per person per match - no changes once submitted',
        'Use the same phone number every time so your picks stay together',
        'Patrons from both Haverhill and Nashua compete in one combined draw',
        "Staff of The Peddler's Daughter are not eligible to win",
      ]],
      ['🎯 Scoring & raffle entries', [
        'Correct result prediction earns 1 raffle entry toward the TV draw',
        'Correct result AND exact final scoreline earns 3 raffle entries total (+2 bonus)',
        'Incorrect predictions earn 0 entries - but every match is a new chance',
        'Score prediction is optional - you still earn 1 entry for getting the result right',
        'Score prediction is the final score after 90 minutes (or after extra time and a penalty shootout in knockout rounds)',
        'Your predicted score must be consistent with your result pick — e.g. if you pick Home Win, the home score must be higher',
        'The leaderboard shows total raffle entries',
        'You can enter every match across the tournament',
        'There are 104 matches total, giving a maximum of 312 raffle entries per person',
      ]],
      ['⏱️ Timing', [
        'The app shows all matches available to predict in a rolling 4-day window',
        'On June 11 (tournament open day) all matches through June 14 are available',
        'Each day the window rolls forward — on June 12 you can predict through June 15, on June 13 through June 16, and so on',
        'Predictions close at kick-off — no entries once the match has started',
        'Results are confirmed by staff at the end of each match',
      ]],
      ['🎲 The TV raffle draw', [
        'The raffle draw takes place after the World Cup Final on July 19, 2026',
        'There is one combined draw — all entries from Haverhill and Nashua go into the same pool',
        'The leaderboard shows raffle ticket counts — more tickets means more chances, but it is a random draw',
        'Being at the top of the leaderboard does not guarantee winning — the winner is drawn at random',
        'Your raffle entries = 1 per correct result + 2 bonus per exact score',
        'If the winner is not present, they will be contacted by phone',
        'Winners have 48 hours to claim their prize',
      ]],
      ['🤝 Fair play', [
        "You must be physically present at The Peddler's Daughter to enter",
        'Entries submitted from outside the pub premises are invalid',
        'Multiple accounts using different phone numbers by the same person are not permitted',
        'Management reserves the right to disqualify entries that violate fair play',
        "Management's decisions are final",
      ]],
      ['🔒 Privacy', [
        'Your phone number is used to link your predictions together and for winner contact',
        'Your email address, if provided, may be used for emails related to Peddlers marketing',
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
    prizeLead: '¡Un televisor — un ganador entre los dos pubs!',
    prizeBody: 'Se sortea al final de la Final del Mundial el 19 de julio de 2026. Todas las entradas de Haverhill y Nashua compiten juntas en un único sorteo. Resultado correcto = 1 boleto, marcador exacto = 3 boletos. Cuanto más predices, mayores son tus posibilidades.',
    sections: [
      ['📱 Cómo participar', [
        "Visita The Peddler's Daughter en Haverhill, MA o Nashua, NH durante el Mundial",
        'Escanea el código QR en tu mesa o en la barra, o abre esta app en tu teléfono',
        'Selecciona tu ubicación - Haverhill o Nashua',
        'Ingresa tu nombre, número de teléfono y, opcionalmente, tu correo electrónico',
        'Elige tu predicción: gana local, empate o gana visitante',
        'Opcionalmente predice el marcador exacto para ganar 2 boletos de bonificación',
        'Presiona enviar - ¡ya estás participando!',
      ]],
      ['✅ Elegibilidad', [
        "Debes estar físicamente dentro de The Peddler's Daughter para participar",
        'Debes tener 21 años o más',
        'Una predicción por persona por partido - no se puede cambiar después de enviarla',
        'Usa el mismo número de teléfono cada vez para mantener tus picks juntos',
        'Los patrones de ambos pubs compiten en un único sorteo combinado',
        "El personal de The Peddler's Daughter no puede ganar",
      ]],
      ['🎯 Puntuación y boletos de rifa', [
        'Predicción de resultado correcta = 1 boleto de rifa',
        'Resultado correcto Y marcador final exacto = 3 boletos en total (+2 de bonificación)',
        'Las predicciones incorrectas ganan 0 boletos - pero cada partido es una nueva oportunidad',
        'El marcador es opcional - igual ganas 1 boleto por acertar el resultado',
        'La predicción de marcador es el resultado final a los 90 minutos (o tras la prórroga y penaltis en las rondas eliminatorias)',
        'Tu marcador predicho debe coincidir con tu elección de resultado — por ejemplo, si predices victoria local, el marcador local debe ser mayor',
        'La clasificación muestra el total de boletos de rifa',
        'Puedes participar en todos los partidos del torneo',
        'Hay 104 partidos en total, con un máximo de 312 boletos por persona',
      ]],
      ['⏱️ Horarios', [
        'La app muestra todos los partidos disponibles para predecir en una ventana móvil de 4 días',
        'El 11 de junio (apertura del torneo) todos los partidos hasta el 14 de junio están disponibles',
        'Cada día la ventana avanza — el 12 de junio puedes predecir hasta el 15, el 13 hasta el 16, y así sucesivamente',
        'Las predicciones cierran al inicio del partido — no se aceptan después del pitido inicial',
        'Los resultados son confirmados por el personal al final de cada partido',
      ]],
      ['🎲 Sorteo del televisor', [
        'El sorteo se realiza después de la Final del Mundial el 19 de julio de 2026',
        'Hay un único sorteo combinado — todas las entradas de Haverhill y Nashua van al mismo bombo',
        'La clasificación muestra el conteo de boletos — más boletos = más chances, pero es un sorteo aleatorio',
        'Estar en lo alto de la clasificación no garantiza ganar — el ganador se elige al azar',
        'Tus boletos = 1 por resultado correcto + 2 de bonificación por marcador exacto',
        'Si el ganador no está presente, se le contactará por teléfono',
        'Los ganadores tienen 48 horas para reclamar el premio',
      ]],
      ['🤝 Juego justo', [
        "Debes estar físicamente presente en The Peddler's Daughter para participar",
        'Las entradas enviadas fuera del pub son inválidas',
        'No se permiten múltiples cuentas con distintos números de teléfono para la misma persona',
        'La gerencia puede descalificar entradas que violen el espíritu de juego justo',
        'Las decisiones de la gerencia son finales',
      ]],
      ['🔒 Privacidad', [
        'Tu número de teléfono se usa para vincular tus predicciones y contactar al ganador',
        'Tu correo electrónico, si lo proporcionas, puede usarse para envíos de marketing de Peddlers',
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
