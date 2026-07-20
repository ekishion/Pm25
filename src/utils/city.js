/**
 * 城市名本地化（IP 源常返回英文）
 */

export const CITY_ZH = {
  Beijing: '北京',
  Shanghai: '上海',
  Guangzhou: '广州',
  Shenzhen: '深圳',
  Hangzhou: '杭州',
  Chengdu: '成都',
  Chongqing: '重庆',
  Wuhan: '武汉',
  Nanjing: '南京',
  Tianjin: '天津',
  "Xi'an": '西安',
  Xian: '西安',
  Suzhou: '苏州',
  Xiamen: '厦门',
  Qingdao: '青岛',
  Changsha: '长沙',
  Zhengzhou: '郑州',
  Shenyang: '沈阳',
  Dalian: '大连',
  Kunming: '昆明',
  Hefei: '合肥',
  Fuzhou: '福州',
  Jinan: '济南',
  Harbin: '哈尔滨',
  'Hong Kong': '香港',
  Hongkong: '香港',
  Macau: '澳门',
  Macao: '澳门',
  Taipei: '台北',
}

/** 去掉「市」后缀 */
export function cleanCityName(city) {
  if (!city) return ''
  return String(city).replace(/市$/, '').trim()
}

/**
 * @param {string} city
 * @param {'zh'|'en'} [locale]
 */
export function localizeCity(city, locale = 'zh') {
  const cleaned = cleanCityName(city)
  if (!cleaned) return ''
  if (locale === 'zh') {
    return CITY_ZH[cleaned] || CITY_ZH[city] || cleaned
  }
  return cleaned
}
