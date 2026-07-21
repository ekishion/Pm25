import { describe, expect, it } from 'vitest'
import { cleanCityName, localizeCity } from './city'

describe('cleanCityName', () => {
  it('strips 市 suffix', () => {
    expect(cleanCityName('苏州市')).toBe('苏州')
    expect(cleanCityName('北京市')).toBe('北京')
  })
})

describe('localizeCity (sync fallback)', () => {
  it('only cleans without dictionary mapping', () => {
    expect(localizeCity('苏州市', 'en')).toBe('苏州')
    expect(localizeCity('Suzhou', 'zh')).toBe('Suzhou')
  })
})
