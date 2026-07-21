import { describe, expect, it } from 'vitest'
import {
  calcMatchEquivalents,
  getAqiLevel,
  approxCnAqiFromUs,
  cnAqiFromPm25,
  resolveDisplayAqi,
  formatMatchCount,
  pickConcentration,
  matchesPerHourFromConcentration,
  computeBurnIntensity,
  CLEAN_PM25,
  PM25_OFF_SCALE,
  BURN_INTENSITY_K,
} from './aqi'
import { resolveFireMode, clusterSlot, bonfireLogCount } from './fireMode'

describe('calcMatchEquivalents', () => {
  it('uses pm25 preferentially', () => {
    const r = calcMatchEquivalents({ pm25: 80, aqi: 10 })
    expect(r.matchesPerHour).toBe(5)
    expect(r.concentration).toBe(80)
    expect(r.isClean).toBe(false)
    expect(r.offScale).toBe(false)
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
    expect(r.offScale).toBe(false)
  })

  it('marks near-zero pm25 as clean', () => {
    const r = calcMatchEquivalents({ pm25: 0 })
    expect(r.isClean).toBe(true)
    expect(r.burnIntensity).toBe(0)
  })

  it('flags offScale above national cap concentration', () => {
    const r = calcMatchEquivalents({ pm25: PM25_OFF_SCALE + 1 })
    expect(r.offScale).toBe(true)
    expect(r.matchesPerHour).toBeGreaterThan(0)
  })
})

describe('matchesPerHourFromConcentration', () => {
  it('scales linearly with concentration', () => {
    // 80 * 0.5 / 8 = 5
    expect(matchesPerHourFromConcentration(80)).toBe(5)
    expect(matchesPerHourFromConcentration(0)).toBe(0)
    expect(matchesPerHourFromConcentration(-1)).toBe(0)
  })
})

describe('computeBurnIntensity', () => {
  it('is zero at empty / non-positive', () => {
    expect(computeBurnIntensity(0)).toBe(0)
    expect(computeBurnIntensity(-3)).toBe(0)
  })

  it('is smooth near clean threshold (no 0→0.04 cliff)', () => {
    const a = computeBurnIntensity(CLEAN_PM25)
    const b = computeBurnIntensity(CLEAN_PM25 + 0.1)
    expect(a).toBeGreaterThan(0)
    expect(b).toBeGreaterThan(a)
    // 旧版会直接跳到 ≥0.04；新版在 2.1 附近应明显小于 0.04 的硬跳感
    expect(b - a).toBeLessThan(0.01)
  })

  it('is monotonic increasing', () => {
    const samples = [1, 10, 35, 75, 115, 150, 250, 500]
    for (let i = 1; i < samples.length; i += 1) {
      expect(computeBurnIntensity(samples[i])).toBeGreaterThan(
        computeBurnIntensity(samples[i - 1]),
      )
    }
  })

  it('leaves headroom at bonfire boundary (~150)', () => {
    const at150 = computeBurnIntensity(150)
    // 1 - exp(-150/90) ≈ 0.811
    expect(at150).toBeGreaterThan(0.75)
    expect(at150).toBeLessThan(0.9)
    expect(at150).toBeLessThan(1)
  })

  it('approaches but does not hard-cap at 1 for extreme haze', () => {
    const at500 = computeBurnIntensity(500)
    expect(at500).toBeGreaterThan(0.98)
    expect(at500).toBeLessThan(1)
  })

  it('uses BURN_INTENSITY_K as scale', () => {
    // intensity(K) = 1 - e^-1 ≈ 0.632
    const atK = computeBurnIntensity(BURN_INTENSITY_K)
    expect(atK).toBeGreaterThan(0.6)
    expect(atK).toBeLessThan(0.66)
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

describe('cnAqiFromPm25', () => {
  it('maps common breakpoints', () => {
    expect(cnAqiFromPm25(0)).toBe(0)
    expect(cnAqiFromPm25(35)).toBe(50)
    expect(cnAqiFromPm25(75)).toBe(100)
    // PM2.5 55 ≈ 国标 AQI 75（良）
    expect(cnAqiFromPm25(55)).toBe(75)
  })
})

describe('resolveDisplayAqi', () => {
  it('prefers CN AQI when reported looks like US AQI', () => {
    // 153 对 PM2.5 55 明显偏美标（阈值 1.35x+15 锁定）
    expect(resolveDisplayAqi({ pm25: 55, aqi: 153 })).toBe(75)
  })

  it('keeps reported CN AQI when consistent', () => {
    expect(resolveDisplayAqi({ pm25: 55, aqi: 78 })).toBe(78)
  })

  it('does not over-correct mild over-report', () => {
    // 略高于反算但仍在阈值内 → 保留上报
    expect(resolveDisplayAqi({ pm25: 55, aqi: 90 })).toBe(90)
  })

  it('uses pm25-only when aqi missing', () => {
    expect(resolveDisplayAqi({ pm25: 35 })).toBe(50)
  })

  it('does not treat missing pm25 as zero', () => {
    expect(resolveDisplayAqi({ pm25: null, aqi: 40 })).toBe(40)
    expect(resolveDisplayAqi({ aqi: 40 })).toBe(40)
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
    // 火柴当量优先：3.4 根/时 → 一簇，不被偏高 AQI 单独抬成火堆
    expect(resolveFireMode({ aqi: 75, matchesPerHour: 3.4, concentration: 55 })).toBe('cluster')
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

