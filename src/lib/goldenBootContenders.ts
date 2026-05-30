// Pre-seeded Golden Boot contenders — shown before tournament starts.
// Update this list after squads are confirmed (approx June 1, 2026).
export type Contender = {
  name: string
  team: string   // club team
  country: string
  flag: string   // emoji
  id: number | null  // API-Football player ID (null = not yet verified)
}

export const GOLDEN_BOOT_CONTENDERS: Contender[] = [
  { name: 'Kylian Mbappé',     team: 'Real Madrid',     country: 'France',    flag: '🇫🇷', id: null },
  { name: 'Erling Haaland',    team: 'Manchester City', country: 'Norway',    flag: '🇳🇴', id: null },
  { name: 'Vinicius Jr',       team: 'Real Madrid',     country: 'Brazil',    flag: '🇧🇷', id: null },
  { name: 'Lautaro Martínez',  team: 'Inter Milan',     country: 'Argentina', flag: '🇦🇷', id: null },
  { name: 'Harry Kane',        team: 'Bayern Munich',   country: 'England',   flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', id: null },
  { name: 'Christian Pulisic', team: 'AC Milan',        country: 'USA',       flag: '🇺🇸', id: null },
  { name: 'Romelu Lukaku',     team: 'Napoli',          country: 'Belgium',   flag: '🇧🇪', id: null },
  { name: 'Lamine Yamal',      team: 'Barcelona',       country: 'Spain',     flag: '🇪🇸', id: null },
  { name: 'Bukayo Saka',       team: 'Arsenal',         country: 'England',   flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', id: null },
  { name: 'Antoine Griezmann', team: 'Atletico Madrid', country: 'France',    flag: '🇫🇷', id: null },
]
