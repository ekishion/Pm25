/**
 * 安全与脱敏工具：避免路径、密钥、堆栈泄露到 UI / 日志
 */

const PATH_RE =
  /(?:[A-Za-z]:)?(?:[\\/][^\s:'"]+)+|(?:file:\/\/\/[^\s]+)|(?:https?:\/\/[^\s]+)/g

const SECRET_RE =
  /(?:token|key|secret|password|authorization)\s*[:=]\s*['"]?[\w\-./+=]{6,}/gi

/** 截断并清洗错误信息，防止暴露本机路径与密钥 */
export function sanitizeError(err, fallback = '请求失败') {
  let msg = ''
  if (typeof err === 'string') msg = err
  else if (err && typeof err.message === 'string') msg = err.message
  else msg = fallback

  msg = msg
    .replace(SECRET_RE, '[redacted]')
    .replace(PATH_RE, '[path]')
    .replace(/\s+/g, ' ')
    .trim()

  if (msg.length > 120) msg = `${msg.slice(0, 117)}...`
  if (!msg) return fallback
  return msg
}

/** 仅保留有限小数的坐标，避免过度精度 */
export function truncateCoord(n, digits = 4) {
  // null/undefined/'' 不能走 Number(null)===0
  if (n == null || n === '') return null
  const v = Number(n)
  if (!Number.isFinite(v)) return null
  const p = 10 ** digits
  return Math.round(v * p) / p
}

/** 有效地理坐标（拒绝缺测被写成 0,0 的 Null Island） */
export function isValidCoord(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false
  if (Math.abs(lat) < 1e-6 && Math.abs(lon) < 1e-6) return false
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false
  return true
}

/** 浅裁剪对象，去掉 raw / 大字段 */
export function pickPublic(obj, keys) {
  const out = {}
  for (const k of keys) {
    if (obj && obj[k] !== undefined) out[k] = obj[k]
  }
  return out
}
