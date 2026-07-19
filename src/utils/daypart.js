/**
 * 一天中的光：只影响 CSS 变量，不换主题
 */

export function getDaypart(date = new Date()) {
  const h = date.getHours() + date.getMinutes() / 60
  if (h >= 5 && h < 8) return 'dawn'
  if (h >= 8 && h < 17) return 'day'
  if (h >= 17 && h < 20) return 'dusk'
  return 'night'
}

/** 返回可挂到 :root / .app 的 CSS 变量 */
export function daypartStyle(date = new Date()) {
  const part = getDaypart(date)
  switch (part) {
    case 'dawn':
      return {
        '--day-warm': '0.03',
        '--day-shadow': '0.04',
        '--flame-hue': '1.05',
        '--flame-sat': '0.95',
      }
    case 'dusk':
      return {
        '--day-warm': '0.045',
        '--day-shadow': '0.06',
        '--flame-hue': '0.98',
        '--flame-sat': '1.05',
      }
    case 'night':
      return {
        '--day-warm': '0.02',
        '--day-shadow': '0.08',
        '--flame-hue': '0.96',
        '--flame-sat': '1.08',
      }
    default:
      return {
        '--day-warm': '0',
        '--day-shadow': '0.05',
        '--flame-hue': '1',
        '--flame-sat': '1',
      }
  }
}
