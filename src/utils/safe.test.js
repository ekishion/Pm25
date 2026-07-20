import { describe, expect, it } from 'vitest'
import { isValidCoord, truncateCoord } from './safe'

describe('truncateCoord', () => {
  it('does not turn null into 0', () => {
    expect(truncateCoord(null)).toBeNull()
    expect(truncateCoord(undefined)).toBeNull()
    expect(truncateCoord('')).toBeNull()
  })

  it('keeps finite numbers', () => {
    expect(truncateCoord(31.299758)).toBe(31.2998)
    expect(truncateCoord(0)).toBe(0)
  })
})

describe('isValidCoord', () => {
  it('rejects null island', () => {
    expect(isValidCoord(0, 0)).toBe(false)
    expect(isValidCoord(null, null)).toBe(false)
  })

  it('accepts real coords', () => {
    expect(isValidCoord(31.3, 120.6)).toBe(true)
  })
})
