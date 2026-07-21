/**
 * 城市名工具（轻量、无大字典）
 * 展示名解析见 resolvePlaceLabel（地理编码 / 逆地理 + 语言）
 */

/** 去掉「市」「特别行政区」等展示噪音 */
export function cleanCityName(city) {
  if (!city) return ''
  return String(city)
    .replace(/特别行政区$/u, '')
    .replace(/市$/u, '')
    .trim()
}

/**
 * 同步兜底：无法请求时至少清理后缀
 * @param {string} city
 * @param {'zh'|'en'} [locale]
 */
export function localizeCity(city, locale = 'zh') {
  void locale
  return cleanCityName(city) || String(city || '').trim()
}
