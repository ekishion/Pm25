import { describe, expect, it } from 'vitest'
import { formatCoords, issueStamp } from './editorial'

describe('issueStamp', () => {
  it('包含年份与三位日序', () => {
    const s = issueStamp(new Date(2026, 0, 15))
    expect(s).toBe('MATCH · VOL. 2026 · NO. 015')
  })

  it('默认使用当前日期', () => {
    expect(issueStamp()).toMatch(/^MATCH · VOL\. \d{4} · NO\. \d{3,}$/)
  })
})

describe('formatCoords', () => {
  it('格式化南北 / 东西半球', () => {
    expect(formatCoords(39.9, 116.4)).toBe('39.90° N  ·  116.40° E')
    expect(formatCoords(-33.87, -70.66)).toBe('33.87° S  ·  70.66° W')
  })

  it('非法输入返回空串', () => {
    expect(formatCoords(null, 116.4)).toBe('')
    expect(formatCoords('x', 'y')).toBe('')
    expect(formatCoords(undefined, undefined)).toBe('')
  })
})
