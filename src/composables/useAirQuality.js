/**
 * 定位 + 空气 + 天气 + 城市展示名
 */

import { computed, ref } from 'vue'
import { detectLocation } from '../services/location'
import { fetchAirQuality } from '../services/airQuality'
import { fetchWeather, weatherToStyle } from '../services/weather'
import { resolvePlaceLabel } from '../services/placeName'
import { isDailyLimitError } from '../services/http'
import { sanitizeError } from '../utils/safe'
import { cleanCityName, localizeCity } from '../utils/city'
import { createDevProbe } from '../utils/debug'
import { getLocale, t } from '../i18n'

const LOAD_COOLDOWN_MS = 12 * 1000
const PLACE_WAIT_MS = 1200

/**
 * 启动加载阶段权重（开屏进度用，只前进不回退）
 * fonts 由 App 侧并行计入
 */
export const LOAD_STAGES = Object.freeze({
  start: 0.05,
  location: 0.35,
  air: 0.75,
  weather: 0.9,
  place: 0.96,
  done: 1,
})

/**
 * @param {{
 *   onQuotaExceeded?: (limit: number) => void,
 *   onFlashHint?: (text: string) => void,
 *   onLoadProgress?: (info: { stage: string, progress: number }) => void,
 * }} deps
 */
export function useAirQuality(deps = {}) {
  const probe = createDevProbe()
  const loading = ref(true)
  const error = ref('')
  const location = ref(null)
  const air = ref(null)
  const weather = ref({ wind: 0, humidity: 50 })
  const offline = ref(false)
  const quotaExceeded = ref(false)
  const quotaLimit = ref(200)
  const placeLabel = ref('')
  const localeTick = ref(0)

  let loadPromise = null
  let loadSeq = 0
  let lastLoadAt = 0
  let placeResolveToken = 0

  const place = computed(() => {
    void localeTick.value
    if (loading.value && !location.value) return ''
    if (placeLabel.value) return placeLabel.value
    return localizeCity(location.value?.city, getLocale())
  })

  const wxStyle = computed(() => weatherToStyle(weather.value || {}))

  function reportProgress(stage) {
    const progress = LOAD_STAGES[stage]
    if (progress == null) return
    deps.onLoadProgress?.({ stage, progress })
  }

  function isValidCoords(lat, lon) {
    return (
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      !(Math.abs(lat) < 1e-6 && Math.abs(lon) < 1e-6)
    )
  }

  async function refreshPlaceLabel() {
    const loc = location.value
    if (!loc?.city && !(Number.isFinite(loc?.lat) && Number.isFinite(loc?.lon))) {
      placeLabel.value = ''
      return
    }
    const token = ++placeResolveToken
    const locale = getLocale()
    placeLabel.value = cleanCityName(loc.city) || loc.city || ''
    try {
      const label = await resolvePlaceLabel({
        city: loc.city,
        lat: loc.lat,
        lon: loc.lon,
        locale,
      })
      if (token !== placeResolveToken) return
      if (label) placeLabel.value = label
    } catch {
      if (token !== placeResolveToken) return
      placeLabel.value = cleanCityName(loc.city) || loc.city || ''
    }
  }

  function bumpLocale() {
    localeTick.value += 1
    refreshPlaceLabel()
  }

  async function loadData(options = {}) {
    const force = Boolean(options.force)

    if (loadPromise && !force) return loadPromise

    if (
      !force &&
      lastLoadAt &&
      Date.now() - lastLoadAt < LOAD_COOLDOWN_MS &&
      (air.value || location.value)
    ) {
      loading.value = false
      if (options.fromUser) deps.onFlashHint?.(t('waitCooldown'))
      return
    }

    const seq = ++loadSeq
    loading.value = true
    if (force) error.value = ''

    const run = (async () => {
      let placeTimer = 0
      try {
        offline.value = typeof navigator !== 'undefined' && navigator.onLine === false
        reportProgress('start')

        const loc = await detectLocation({ force })
        if (seq !== loadSeq) return

        location.value = {
          city: loc.city,
          province: loc.province,
          adcode: loc.adcode || '',
          lat: loc.lat,
          lon: loc.lon,
          source: loc.source,
        }
        reportProgress('location')

        const placeP = refreshPlaceLabel().then(() => {
          if (seq === loadSeq) reportProgress('place')
        })

        if (!isValidCoords(loc.lat, loc.lon)) {
          throw new Error('coords')
        }

        const wxP = fetchWeather({
          lat: loc.lat,
          lon: loc.lon,
          adcode: loc.adcode || '',
          force,
        })
          .catch(() => ({ wind: 0, humidity: 50, source: '' }))
          .then((wx) => {
            if (seq === loadSeq) reportProgress('weather')
            return wx
          })

        const aq = await fetchAirQuality({ lat: loc.lat, lon: loc.lon, force })
        if (seq !== loadSeq) return
        reportProgress('air')

        const wx = await wxP
        if (seq !== loadSeq) return

        if (aq?.aqi == null && aq?.pm25 == null) {
          throw new Error('air empty')
        }

        air.value = aq
        weather.value = wx

        await Promise.race([
          placeP,
          new Promise((resolve) => {
            placeTimer = window.setTimeout(resolve, PLACE_WAIT_MS)
          }),
        ])
        if (placeTimer) window.clearTimeout(placeTimer)
        if (seq !== loadSeq) return

        lastLoadAt = Date.now()
        error.value = ''
        reportProgress('done')
        probe.note('loaded', {
          source: aq.source,
          weather: wx.source,
          city: loc.city,
          aqi: aq.aqi,
          pm25: aq.pm25,
        })
        if (options.fromUser) deps.onFlashHint?.(t('refreshed'))
      } catch (e) {
        if (seq !== loadSeq) return
        if (placeTimer) window.clearTimeout(placeTimer)

        if (isDailyLimitError(e)) {
          quotaExceeded.value = true
          const lim = Number(e?.body?.limit)
          if (Number.isFinite(lim) && lim > 0) quotaLimit.value = lim
          air.value = null
          error.value = 'quota'
          reportProgress('done')
          deps.onQuotaExceeded?.(quotaLimit.value)
          probe.note('quota-exceeded', quotaLimit.value)
          return
        }

        if (force) air.value = null
        error.value = sanitizeError(e, 'fail')
        reportProgress('done')
        probe.note('load-fail', error.value)
      } finally {
        if (seq === loadSeq) {
          loading.value = false
          loadPromise = null
        }
      }
    })()

    loadPromise = run
    return run
  }

  async function softRefresh({ stage, onBurningRefresh } = {}) {
    if (quotaExceeded.value) {
      deps.onFlashHint?.(t('quotaHint', { n: quotaLimit.value || 200 }))
      return
    }
    if (lastLoadAt && Date.now() - lastLoadAt < LOAD_COOLDOWN_MS && !error.value) {
      deps.onFlashHint?.(t('waitCooldown'))
      return
    }
    await loadData({ force: true, fromUser: true })
    if (stage === 'burning' && !error.value && air.value) {
      onBurningRefresh?.()
    }
  }

  function syncOnlineStatus() {
    offline.value = typeof navigator !== 'undefined' && navigator.onLine === false
  }

  return {
    loading,
    error,
    location,
    air,
    weather,
    offline,
    quotaExceeded,
    quotaLimit,
    placeLabel,
    localeTick,
    place,
    wxStyle,
    loadData,
    softRefresh,
    refreshPlaceLabel,
    bumpLocale,
    syncOnlineStatus,
    lastLoadAt: () => lastLoadAt,
  }
}
