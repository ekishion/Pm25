import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearRequestCache, guardedRequest } from './requestGuard'

describe('guardedRequest', () => {
  beforeEach(() => {
    clearRequestCache()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })

  it('dedupes concurrent calls', async () => {
    let calls = 0
    const fn = vi.fn(async () => {
      calls += 1
      await Promise.resolve()
      return { n: calls }
    })

    const [a, b] = await Promise.all([
      guardedRequest('k1', fn, { ttlMs: 60_000 }),
      guardedRequest('k1', fn, { ttlMs: 60_000 }),
    ])
    expect(a).toEqual(b)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('returns cache within ttl', async () => {
    const fn = vi.fn(async () => ({ v: 1 }))
    await guardedRequest('k2', fn, { ttlMs: 60_000 })
    await guardedRequest('k2', fn, { ttlMs: 60_000 })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('cools down errors', async () => {
    const fn = vi.fn(async () => {
      throw new Error('boom')
    })
    await expect(guardedRequest('k3', fn, { errorTtlMs: 10_000 })).rejects.toThrow()
    await expect(guardedRequest('k3', fn, { errorTtlMs: 10_000 })).rejects.toThrow()
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
