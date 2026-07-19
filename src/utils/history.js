/**
 * 同城历史一瞥：只记上一次有效读数
 */

const KEY = 'pm25-hist-v1'

export function readHistory() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object') return null
    return data
  } catch {
    return null
  }
}

export function writeHistory(entry) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        city: entry.city || '',
        matches: Number(entry.matches) || 0,
        at: entry.at || Date.now(),
      }),
    )
  } catch {
    /* ignore */
  }
}

/**
 * 与上次比较；写入本次
 * @returns {{ textKey: string, n?: string } | null}
 */
export function compareAndStore({ city, matches }) {
  const prev = readHistory()
  const now = Date.now()
  const cur = Number(matches)
  if (!Number.isFinite(cur)) return null

  let delta = null
  if (prev && prev.city && city && prev.city === city && Number.isFinite(Number(prev.matches))) {
    // 仅在 24h 内比较
    if (now - Number(prev.at || 0) < 24 * 60 * 60 * 1000) {
      const d = Math.round((cur - Number(prev.matches)) * 10) / 10
      if (d > 0.05) delta = { textKey: 'deltaUp', n: d.toFixed(1) }
      else if (d < -0.05) delta = { textKey: 'deltaDown', n: d.toFixed(1) }
      else delta = { textKey: 'deltaSame' }
    }
  }

  writeHistory({ city, matches: cur, at: now })
  return delta
}
