import { describe, expect, it, beforeEach } from 'vitest'
import {
  DEFAULT_DAILY_API_LIMIT,
  parseDailyLimit,
  peekQuota,
  refundQuota,
  resetQuotaForTests,
  takeQuota,
  utcDayKey,
} from './quota.mjs'

beforeEach(() => {
  resetQuotaForTests()
})

describe('parseDailyLimit', () => {
  it('defaults to 500', () => {
    expect(parseDailyLimit({})).toBe(DEFAULT_DAILY_API_LIMIT)
    expect(parseDailyLimit({ DAILY_API_LIMIT: '' })).toBe(500)
  })

  it('parses positive ints', () => {
    expect(parseDailyLimit({ DAILY_API_LIMIT: '50' })).toBe(50)
  })

  it('treats 0 / negative as unlimited', () => {
    expect(parseDailyLimit({ DAILY_API_LIMIT: '0' })).toBe(0)
    expect(parseDailyLimit({ DAILY_API_LIMIT: '-1' })).toBe(0)
  })
})

describe('takeQuota', () => {
  it('allows until limit then blocks', () => {
    const now = new Date('2026-07-21T12:00:00Z')
    expect(takeQuota({ limit: 2, key: 't', now }).allowed).toBe(true)
    expect(takeQuota({ limit: 2, key: 't', now }).allowed).toBe(true)
    const blocked = takeQuota({ limit: 2, key: 't', now })
    expect(blocked.allowed).toBe(false)
    expect(blocked.remaining).toBe(0)
    expect(blocked.day).toBe(utcDayKey(now))
  })

  it('resets on new UTC day', () => {
    const d1 = new Date('2026-07-21T23:00:00Z')
    const d2 = new Date('2026-07-22T01:00:00Z')
    takeQuota({ limit: 1, key: 'day', now: d1 })
    expect(takeQuota({ limit: 1, key: 'day', now: d1 }).allowed).toBe(false)
    expect(takeQuota({ limit: 1, key: 'day', now: d2 }).allowed).toBe(true)
  })

  it('unlimited when limit is 0', () => {
    for (let i = 0; i < 5; i += 1) {
      expect(takeQuota({ limit: 0, key: 'u' }).allowed).toBe(true)
    }
  })

  it('peek does not consume', () => {
    takeQuota({ limit: 3, key: 'p' })
    const peek = peekQuota({ limit: 3, key: 'p' })
    expect(peek.used).toBe(1)
    expect(peek.remaining).toBe(2)
  })
})

describe('refundQuota', () => {
  it('refunds a taken slot', () => {
    takeQuota({ limit: 2, key: 'r' })
    takeQuota({ limit: 2, key: 'r' })
    refundQuota({ limit: 2, key: 'r' })
    const peek = peekQuota({ limit: 2, key: 'r' })
    expect(peek.used).toBe(1)
    expect(peek.remaining).toBe(1)
  })

  it('never drops below zero', () => {
    refundQuota({ limit: 2, key: 'fresh' })
    expect(peekQuota({ limit: 2, key: 'fresh' }).used).toBe(0)
  })

  it('ignores unknown day buckets', () => {
    takeQuota({ limit: 2, key: 'd', now: new Date('2026-07-21T12:00:00Z') })
    refundQuota({ limit: 2, key: 'd', now: new Date('2026-07-22T12:00:00Z') })
    expect(peekQuota({ limit: 2, key: 'd', now: new Date('2026-07-21T12:00:00Z') }).used).toBe(1)
  })

  it('no-ops when unlimited', () => {
    expect(() => refundQuota({ limit: 0, key: 'u' })).not.toThrow()
  })
})
