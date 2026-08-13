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

  it('keeps a forced replacement request deduped after the old request settles', async () => {
    const resolvers = []
    const fn = vi.fn(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve)
        }),
    )

    const first = guardedRequest('race', fn)
    const replacement = guardedRequest('race', fn, { force: true })

    resolvers[0]({ version: 1 })
    await first

    const stillPending = guardedRequest('race', fn)
    expect(fn).toHaveBeenCalledTimes(2)

    resolvers[1]({ version: 2 })
    await expect(replacement).resolves.toEqual({ version: 2 })
    await expect(stillPending).resolves.toEqual({ version: 2 })
  })

  it('does not cache an old request error over a forced replacement', async () => {
    const rejectors = []
    const fn = vi.fn(
      () =>
        new Promise((resolve, reject) => {
          rejectors.push({ resolve, reject })
        }),
    )

    const first = guardedRequest('error-race', fn)
    const replacement = guardedRequest('error-race', fn, { force: true })

    rejectors[0].reject(new Error('old error'))
    await expect(first).rejects.toThrow('old error')

    rejectors[1].resolve({ version: 2 })
    await expect(replacement).resolves.toEqual({ version: 2 })
    await expect(guardedRequest('error-race', fn)).resolves.toEqual({ version: 2 })
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
