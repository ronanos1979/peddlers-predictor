import { GOLDEN_BOOT_CONTENDERS, type Contender } from '../goldenBootContenders'

describe('GOLDEN_BOOT_CONTENDERS', () => {
  it('has exactly 10 contenders', () => {
    expect(GOLDEN_BOOT_CONTENDERS).toHaveLength(10)
  })

  it('every contender has required fields', () => {
    GOLDEN_BOOT_CONTENDERS.forEach((p: Contender) => {
      expect(p.name).toBeTruthy()
      expect(p.team).toBeTruthy()
      expect(p.country).toBeTruthy()
      expect(p.flag).toBeTruthy()
    })
  })

  it('includes Kylian Mbappé (France)', () => {
    const player = GOLDEN_BOOT_CONTENDERS.find(p => p.name === 'Kylian Mbappé')
    expect(player).toBeDefined()
    expect(player?.country).toBe('France')
  })

  it('includes Erling Haaland (Norway)', () => {
    const player = GOLDEN_BOOT_CONTENDERS.find(p => p.name === 'Erling Haaland')
    expect(player).toBeDefined()
    expect(player?.country).toBe('Norway')
  })

  it('includes Christian Pulisic (USA) — nod to the Peddler\'s crowd', () => {
    const player = GOLDEN_BOOT_CONTENDERS.find(p => p.name === 'Christian Pulisic')
    expect(player).toBeDefined()
    expect(player?.country).toBe('USA')
    expect(player?.team).toBe('AC Milan')
  })

  it('has no duplicate player names', () => {
    const names = GOLDEN_BOOT_CONTENDERS.map(p => p.name)
    const unique = new Set(names)
    expect(unique.size).toBe(names.length)
  })

  it('all flags are single emoji characters (not empty)', () => {
    GOLDEN_BOOT_CONTENDERS.forEach(p => {
      expect(p.flag.trim().length).toBeGreaterThan(0)
    })
  })

  it('represents multiple countries (at least 5 different nations)', () => {
    const countries = new Set(GOLDEN_BOOT_CONTENDERS.map(p => p.country))
    expect(countries.size).toBeGreaterThanOrEqual(5)
  })

  it('includes players from WC 2026 nations (France, Brazil, Argentina, England, Norway, USA, Belgium, Spain)', () => {
    const countries = new Set(GOLDEN_BOOT_CONTENDERS.map(p => p.country))
    const wc2026Nations = ['France', 'Brazil', 'Argentina', 'England', 'Norway', 'USA', 'Belgium', 'Spain']
    const covered = wc2026Nations.filter(n => countries.has(n))
    expect(covered.length).toBeGreaterThanOrEqual(6)
  })
})
