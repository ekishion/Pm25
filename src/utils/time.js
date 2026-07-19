import { t } from '../i18n'

export function formatClock(isoOrDate) {
  try {
    const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
  } catch {
    return ''
  }
}

export function formatRelative(isoOrDate, now = Date.now()) {
  try {
    const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate)
    const diff = Math.max(0, now - d.getTime())
    if (diff < 45 * 1000) return t('justNow')
    if (diff < 60 * 60 * 1000) return t('minutesAgo', { n: Math.max(1, Math.round(diff / 60000)) })
    if (diff < 24 * 60 * 60 * 1000) return t('hoursAgo', { n: Math.max(1, Math.round(diff / 3600000)) })
    return formatClock(d)
  } catch {
    return ''
  }
}

export function formatUpdatedLine(isoOrDate) {
  if (!isoOrDate) return ''
  const rel = formatRelative(isoOrDate)
  if (!rel) return ''
  return `${t('updated')} ${rel}`
}
