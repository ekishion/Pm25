/**
 * 极简 i18n：中 / 英
 */

const dict = {
  zh: {
    brand: '火柴',
    ignite: '点燃',
    loading: '…',
    soundOn: '关闭声音',
    soundOff: '打开声音',
    share: '分享卡片',
    sharing: '生成中',
    unit: '根 / 时',
    modeMatch: '一根',
    modeCluster: '一簇',
    modeBonfire: '火堆',
    fail: '无法获取',
    failHint: '空气暂时读不到',
    foot: '此刻空气 ≈ 火柴燃烧',
    guide: '点击点燃',
    updated: '更新于',
    justNow: '刚刚',
    minutesAgo: '{n} 分钟前',
    hoursAgo: '{n} 小时前',
    deltaUp: '比上次 +{n}',
    deltaDown: '比上次 {n}',
    deltaSame: '与上次相同',
    shared: '已分享',
    saved: '已保存图片',
    shareFail: '分享失败',
    shareTitle: '分享',
    sharePortrait: '竖版',
    shareSquare: '方形',
    hidePlace: '隐藏城市',
    includePlace: '显示城市',
    save: '保存',
    systemShare: '系统分享',
    close: '关闭',
    offline: '离线 · 上次记录',
    refreshHint: '已是最新',
    refreshed: '已更新',
    waitCooldown: '稍后再试',
  },
  en: {
    brand: 'Match',
    ignite: 'Ignite',
    loading: '…',
    soundOn: 'Mute',
    soundOff: 'Unmute',
    share: 'Share card',
    sharing: 'Working…',
    unit: '/ hr',
    modeMatch: 'single',
    modeCluster: 'cluster',
    modeBonfire: 'bonfire',
    fail: 'unavailable',
    failHint: 'air is quiet for now',
    foot: 'this air ≈ burning matches',
    guide: 'tap to ignite',
    updated: 'updated',
    justNow: 'just now',
    minutesAgo: '{n}m ago',
    hoursAgo: '{n}h ago',
    deltaUp: '+{n} vs last',
    deltaDown: '{n} vs last',
    deltaSame: 'same as last',
    shared: 'shared',
    saved: 'saved',
    shareFail: 'share failed',
    shareTitle: 'Share',
    sharePortrait: 'Portrait',
    shareSquare: 'Square',
    hidePlace: 'Hide city',
    includePlace: 'Show city',
    save: 'Save',
    systemShare: 'Share',
    close: 'Close',
    offline: 'offline · last reading',
    refreshHint: 'already fresh',
    refreshed: 'updated',
    waitCooldown: 'wait a moment',
  },
}

let locale = 'zh'
const listeners = new Set()

export function detectLocale() {
  try {
    const saved = localStorage.getItem('pm25-lang')
    if (saved === 'zh' || saved === 'en') return saved
  } catch {
    /* ignore */
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language || '' : 'zh'
  return nav.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

export function getLocale() {
  return locale
}

export function setLocale(next) {
  locale = next === 'en' ? 'en' : 'zh'
  try {
    localStorage.setItem('pm25-lang', locale)
  } catch {
    /* ignore */
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
  }
  listeners.forEach((fn) => fn(locale))
  return locale
}

export function onLocaleChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function t(key, vars) {
  const table = dict[locale] || dict.zh
  let s = table[key] ?? dict.zh[key] ?? key
  if (vars && typeof vars === 'object') {
    Object.keys(vars).forEach((k) => {
      s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(vars[k]))
    })
  }
  return s
}

export function initI18n() {
  setLocale(detectLocale())
}
