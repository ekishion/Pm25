import { describe, expect, it } from 'vitest'
import {
  fetchAirQualityOnce,
  hasReading,
  normalize,
} from './airQuality'

function delay(ms, value, fail = false) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (fail) reject(value instanceof Error ? value : new Error(String(value)))
      else resolve(value)
    }, ms)
  })
}

describe('normalize', () => {
  it('drops bogus pm25=0 when aqi says otherwise', () => {
    const r = normalize({ pm25: 0, aqi: 40, source: 't' })
    expect(r.pm25).toBeNull()
    expect(r.aqi).toBe(40)
  })

  it('corrects US-like aqi with pm25', () => {
    const r = normalize({ pm25: 55, aqi: 153, source: 't' })
    expect(r.pm25).toBe(55)
    expect(r.aqi).toBe(75)
  })
})

describe('hasReading', () => {
  it('needs aqi or pm25', () => {
    expect(hasReading({ aqi: 10, pm25: null })).toBe(true)
    expect(hasReading({ aqi: null, pm25: 5 })).toBe(true)
    expect(hasReading({ aqi: null, pm25: null })).toBe(false)
  })
})

describe('fetchAirQualityOnce', () => {
  it('prefers qweather when it returns first', async () => {
    const r = await fetchAirQualityOnce(31.3, 120.6, {
      primaryWaitMs: 50,
      overallDeadlineMs: 500,
      sources: {
        qweather: () =>
          delay(10, { aqi: 12, pm25: 8, source: 'qweather', updatedAt: 't' }),
        caiyun: () =>
          delay(30, { aqi: 20, pm25: 15, source: 'caiyun', updatedAt: 't' }),
        waqi: () => delay(30, { aqi: 30, pm25: 20, source: 'waqi', updatedAt: 't' }),
        meteo: () => delay(10, { aqi: 90, pm25: 60, source: 'meteo', updatedAt: 't' }),
      },
    })
    expect(r.source).toBe('qweather')
    expect(r.aqi).toBe(12)
  })

  it('falls to caiyun when qweather fails', async () => {
    const r = await fetchAirQualityOnce(31.3, 120.6, {
      primaryWaitMs: 40,
      overallDeadlineMs: 400,
      sources: {
        qweather: () => delay(5, new Error('qw down'), true),
        caiyun: () =>
          delay(10, { aqi: 18, pm25: 12, source: 'caiyun', updatedAt: 't' }),
        waqi: () => delay(80, { aqi: 40, pm25: 25, source: 'waqi', updatedAt: 't' }),
        meteo: () => delay(10, { aqi: 90, pm25: 60, source: 'meteo', updatedAt: 't' }),
      },
    })
    expect(r.source).toBe('caiyun')
  })

  it('uses meteo when priority sources fail', async () => {
    const r = await fetchAirQualityOnce(31.3, 120.6, {
      primaryWaitMs: 20,
      overallDeadlineMs: 200,
      sources: {
        qweather: () => delay(5, new Error('x'), true),
        caiyun: () => delay(5, new Error('y'), true),
        waqi: () => delay(5, new Error('z'), true),
        meteo: () =>
          delay(10, { aqi: 40, pm25: 28, source: 'meteo', updatedAt: 't' }),
      },
    })
    expect(r.source).toBe('meteo')
    expect(r.pm25).toBe(28)
  })

  it('hits overall deadline and falls to meteo', async () => {
    const r = await fetchAirQualityOnce(31.3, 120.6, {
      primaryWaitMs: 80,
      overallDeadlineMs: 50,
      sources: {
        // 优先源很慢
        qweather: () =>
          delay(200, { aqi: 11, pm25: 7, source: 'qweather', updatedAt: 't' }),
        caiyun: () =>
          delay(200, { aqi: 22, pm25: 14, source: 'caiyun', updatedAt: 't' }),
        waqi: () =>
          delay(200, { aqi: 33, pm25: 20, source: 'waqi', updatedAt: 't' }),
        meteo: () =>
          delay(5, { aqi: 50, pm25: 35, source: 'meteo', updatedAt: 't' }),
      },
    })
    expect(r.source).toBe('meteo')
  })
})
