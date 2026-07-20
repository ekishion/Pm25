import { describe, expect, it } from 'vitest'
import {
  calcMatchEquivalents,
  getAqiLevel,
  approxCnAqiFromUs,
  formatMatchCount,
  pickConcentration,
} from './aqi'
import { resolveFireMode, clusterSlot, bonfireLogCount } from './fireMode'
import { localizeCity } from './city'

describe('calcMatchEquivalents', () => {
  it('uses pm25 preferentially', () => {
    const r = calcMatchEquivalents({ pm25: 80, aqi: 10 })
    expect(r.matchesPerHour).toBe(5)
    expect(r.concentration).toBe(80)
    expect(r.isClean).toBe(false)
  })

  it('falls back to aqi', () => {
    const r = calcMatchEquivalents({ aqi: 64 })
    expect(r.matchesPerHour).toBe(4)
  })

  it('handles empty / clean air', () => {
    const r = calcMatchEquivalents({})
    expect(r.matchesPerHour).toBe(0)
    expect(r.burnIntensity).toBe(0)
    expect(r.isClean).toBe(true)
  })

  it('marks near-zero pm25 as clean', () => {
    const r = calcMatchEquivalents({ pm25: 0 })
    expect(r.isClean).toBe(true)
    expect(r.burnIntensity).toBe(0)
  })
})

describe('getAqiLevel', () => {
  it('classifies ranges', () => {
    expect(getAqiLevel(20).key).toBe('good')
    expect(getAqiLevel(80).key).toBe('moderate')
    expect(getAqiLevel(120).key).toBe('unhealthy')
  })
})

describe('approxCnAqiFromUs', () => {
  it('rounds finite values', () => {
    expect(approxCnAqiFromUs(55.4)).toBe(55)
    expect(approxCnAqiFromUs('x')).toBeNull()
  })
})

describe('formatMatchCount', () => {
  it('formats integers and tenths', () => {
    expect(formatMatchCount(4)).toBe('4')
    expect(formatMatchCount(4.3)).toBe('4.3')
    expect(formatMatchCount(NaN)).toBe('–')
  })
})

describe('pickConcentration', () => {
  it('prefers pm25 when both present', () => {
    expect(pickConcentration({ pm25: 40, aqi: 80 })).toBe(40)
  })

  it('ignores bogus pm25=0 when aqi says otherwise', () => {
    expect(pickConcentration({ pm25: 0, aqi: 16 })).toBe(16)
  })

  it('allows real zero when aqi also clean', () => {
    expect(pickConcentration({ pm25: 0, aqi: 1 })).toBe(0)
  })
})

describe('resolveFireMode', () => {
  it('picks mode by thresholds', () => {
    expect(resolveFireMode({ aqi: 20, matchesPerHour: 1 })).toBe('match')
    expect(resolveFireMode({ aqi: 80, matchesPerHour: 4 })).toBe('cluster')
    expect(resolveFireMode({ aqi: 160, matchesPerHour: 2 })).toBe('bonfire')
    expect(resolveFireMode({ aqi: 10, matchesPerHour: 9 })).toBe('bonfire')
  })
})

describe('clusterSlot', () => {
  it('fans from center', () => {
    const mid = clusterSlot(1, 3)
    expect(mid.nx).toBe(0)
    expect(clusterSlot(0, 3).nx).toBeLessThan(0)
    expect(clusterSlot(2, 3).nx).toBeGreaterThan(0)
  })
})

describe('bonfireLogCount', () => {
  it('scales with visible matches', () => {
    expect(bonfireLogCount(10)).toBe(5)
    expect(bonfireLogCount(14)).toBe(7)
    expect(bonfireLogCount(20)).toBe(8)
  })
})

describe('localizeCity', () => {
  it('maps english city in zh', () => {
    expect(localizeCity('Beijing', 'zh')).toBe('北京')
    expect(localizeCity('北京市', 'zh')).toBe('北京')
    expect(localizeCity('Beijing', 'en')).toBe('Beijing')
  })
})
