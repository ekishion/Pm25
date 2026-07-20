import { describe, expect, it } from 'vitest'
import {
  assertTrustedClient,
  CLIENT_HEADER,
  CLIENT_HEADER_VALUE,
  sanitizeUpstreamPath,
  stripProviderPrefix,
} from './proxy.mjs'

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
