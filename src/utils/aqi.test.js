import { describe, expect, it } from 'vitest'
import { calcMatchEquivalents, getAqiLevel, approxCnAqiFromUs } from './aqi'

describe('calcMatchEquivalents', () => {
  it('uses pm25 preferentially', () => {
    const r = calcMatchEquivalents({ pm25: 80, aqi: 10 })
    expect(r.matchesPerHour).toBe(5)
    expect(r.concentration).toBe(80)
  })

  it('falls back to aqi', () => {
    const r = calcMatchEquivalents({ aqi: 64 })
    expect(r.matchesPerHour).toBe(4)
  })

  it('handles empty', () => {
    const r = calcMatchEquivalents({})
    expect(r.matchesPerHour).toBe(0)
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
