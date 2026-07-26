/**
 * 编辑排版角标：刊号 / 坐标纪实
 * App UI 与分享卡共用，避免文案分叉
 */

/** 杂志刊号：MATCH · VOL. 年 · NO. 日序（一年中的第几天） */
export function issueStamp(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 0)
  const day = Math.floor((date - start) / 86400000)
  return `MATCH · VOL. ${date.getFullYear()} · NO. ${String(day).padStart(3, '0')}`
}

/** 纪实坐标：12.34° N  ·  56.78° E；非法输入返回空串 */
export function formatCoords(lat, lon) {
  if (lat == null || lon == null || lat === '' || lon === '') return ''
  const la = Number(lat)
  const lo = Number(lon)
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return ''
  const ns = la >= 0 ? 'N' : 'S'
  const ew = lo >= 0 ? 'E' : 'W'
  return `${Math.abs(la).toFixed(2)}° ${ns}  ·  ${Math.abs(lo).toFixed(2)}° ${ew}`
}
