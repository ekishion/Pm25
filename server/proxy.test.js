import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assertTrustedClient,
  CLIENT_HEADER,
  CLIENT_HEADER_VALUE,
  extractClientIp,
  proxyProvider,
  sanitizeUpstreamPath,
  stripProviderPrefix,
} from './proxy.mjs'
import { peekQuota, resetQuotaForTests } from './quota.mjs'

describe('stripProviderPrefix', () => {
  it('strips /api/amap', () => {
    expect(stripProviderPrefix('/api/amap/v3/ip', 'amap')).toBe('/v3/ip')
  })

  it('strips /api/caiyun', () => {
    expect(stripProviderPrefix('/api/caiyun/1,2/realtime.json', 'caiyun')).toBe(
      '/1,2/realtime.json',
    )
  })

  it('handles root under provider', () => {
    expect(stripProviderPrefix('/api/waqi', 'waqi')).toBe('')
    expect(stripProviderPrefix('/api/waqi/', 'waqi')).toBe('')
  })
})

function req(path, headers = {}) {
  return new Request(`https://match.example.com${path}`, { headers })
}

describe('assertTrustedClient', () => {
  it('rejects missing client header', async () => {
    const res = assertTrustedClient(req('/api/amap/v3/ip'))
    expect(res).not.toBeNull()
    expect(res.status).toBe(403)
  })

  it('rejects wrong client header', async () => {
    const res = assertTrustedClient(
      req('/api/amap/v3/ip', { [CLIENT_HEADER]: 'nope' }),
    )
    expect(res.status).toBe(403)
  })

  it('rejects cross-origin Origin', async () => {
    const res = assertTrustedClient(
      req('/api/amap/v3/ip', {
        [CLIENT_HEADER]: CLIENT_HEADER_VALUE,
        origin: 'https://evil.example',
      }),
    )
    expect(res.status).toBe(403)
  })

  it('rejects cross-site Referer', async () => {
    const res = assertTrustedClient(
      req('/api/amap/v3/ip', {
        [CLIENT_HEADER]: CLIENT_HEADER_VALUE,
        referer: 'https://evil.example/page',
      }),
    )
    expect(res.status).toBe(403)
  })

  it('allows same-origin with client header', () => {
    const res = assertTrustedClient(
      req('/api/amap/v3/ip', {
        [CLIENT_HEADER]: CLIENT_HEADER_VALUE,
        origin: 'https://match.example.com',
      }),
    )
    expect(res).toBeNull()
  })

  it('allows same-origin header-only (no Origin)', () => {
    const res = assertTrustedClient(
      req('/api/caiyun/1,2/realtime.json', {
        [CLIENT_HEADER]: CLIENT_HEADER_VALUE,
      }),
    )
    expect(res).toBeNull()
  })

  it('rejects OPTIONS preflight', () => {
    const r = new Request('https://match.example.com/api/waqi/x', {
      method: 'OPTIONS',
      headers: { [CLIENT_HEADER]: CLIENT_HEADER_VALUE },
    })
    const res = assertTrustedClient(r)
    expect(res.status).toBe(403)
  })
})

describe('sanitizeUpstreamPath', () => {
  it('allows normal paths', () => {
    expect(sanitizeUpstreamPath('/v3/ip')).toBe('/v3/ip')
    expect(sanitizeUpstreamPath('/1.00,2.00/realtime.json')).toBe('/1.00,2.00/realtime.json')
  })

  it('rejects traversal', () => {
    expect(() => sanitizeUpstreamPath('/../secret')).toThrow()
    expect(() => sanitizeUpstreamPath('/%2e%2e/x')).toThrow()
  })
})

describe('extractClientIp', () => {
  const h = (headers) => new Headers(headers)

  it('prefers CF-Connecting-IP', () => {
    expect(
      extractClientIp(
        h({
          'cf-connecting-ip': '1.2.3.4',
          'x-real-ip': '5.6.7.8',
          'x-forwarded-for': '9.9.9.9, 10.10.10.10',
        }),
      ),
    ).toBe('1.2.3.4')
  })

  it('falls back to x-real-ip then rightmost XFF entry', () => {
    expect(extractClientIp(h({ 'x-real-ip': '5.6.7.8' }))).toBe('5.6.7.8')
    // 最左可被客户端伪造，最右由最近一跳可信代理追加
    expect(extractClientIp(h({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('5.6.7.8')
  })

  it('rejects non-IPv4 (incl. spoofed garbage)', () => {
    expect(extractClientIp(h({ 'cf-connecting-ip': 'fe80::1' }))).toBe('')
    expect(extractClientIp(h({ 'x-forwarded-for': 'not-an-ip' }))).toBe('')
    expect(extractClientIp(h({}))).toBe('')
  })
})

describe('proxyProvider quota accounting', () => {
  const trusted = (path, headers = {}) =>
    new Request(`https://match.example.com${path}`, {
      headers: { [CLIENT_HEADER]: CLIENT_HEADER_VALUE, ...headers },
    })

  beforeEach(() => {
    resetQuotaForTests()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not consume quota when the provider key is missing', async () => {
    const res = await proxyProvider(trusted('/api/amap/v3/geocode/geo?address=x'), {
      provider: 'amap',
      env: {},
    })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.info).toBe('AMAP_KEY missing')
    expect(peekQuota({ limit: 500, key: 'api' }).used).toBe(0)
  })

  it('does not consume quota for waqi without a token (no demo fallback)', async () => {
    const res = await proxyProvider(trusted('/api/waqi/feed/geo:31;120/'), {
      provider: 'waqi',
      env: {},
    })
    expect(res.status).toBe(500)
    expect((await res.json()).info).toBe('WAQI_TOKEN missing')
    expect(peekQuota({ limit: 500, key: 'api' }).used).toBe(0)
  })

  it('refunds quota when upstream fails with 5xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 502 })),
    )
    const env = { AMAP_KEY: 'k', DAILY_API_LIMIT: '1' }
    const res = await proxyProvider(trusted('/api/amap/v3/geocode/geo?address=x'), {
      provider: 'amap',
      env,
    })
    expect(res.status).toBe(502)
    // 预扣 1 后因上游失败退还：配额应回到 0
    expect(peekQuota({ limit: 1, key: 'api' }).used).toBe(0)
  })

  it('keeps quota when upstream succeeds, then 429 once exhausted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"ok":true}', { status: 200 })),
    )
    const env = { AMAP_KEY: 'k', DAILY_API_LIMIT: '1' }
    const ok = await proxyProvider(trusted('/api/amap/v3/geocode/geo?address=x'), {
      provider: 'amap',
      env,
    })
    expect(ok.status).toBe(200)
    expect(peekQuota({ limit: 1, key: 'api' }).used).toBe(1)

    const blocked = await proxyProvider(trusted('/api/amap/v3/geocode/geo?address=y'), {
      provider: 'amap',
      env,
    })
    expect(blocked.status).toBe(429)
    const body = await blocked.json()
    expect(body.code).toBe('DAILY_LIMIT')
  })

  it('injects the client IP for /v3/ip without an ip param', async () => {
    let upstreamUrl = ''
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        upstreamUrl = String(url)
        return new Response('{"status":"1"}', { status: 200 })
      }),
    )
    const res = await proxyProvider(
      trusted('/api/amap/v3/ip', { 'x-real-ip': '203.0.113.7' }),
      { provider: 'amap', env: { AMAP_KEY: 'k' } },
    )
    expect(res.status).toBe(200)
    expect(upstreamUrl).toContain('ip=203.0.113.7')
    expect(upstreamUrl).toContain('key=k')
  })
})
