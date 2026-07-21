/**
 * 点燃状态机 + 数字 count-up + 历史对比
 */

import { computed, onUnmounted, ref } from 'vue'
import { calcMatchEquivalents, formatMatchCount } from '../utils/aqi'
import { resolveFireMode } from '../utils/fireMode'
import { animateNumber, sleep } from '../utils/animate'
import { compareAndStore } from '../utils/history'
import { playStrike } from '../services/audio'
import { t } from '../i18n'

/**
 * @param {{
 *   air: import('vue').Ref,
 *   error: import('vue').Ref<string>,
 *   loading: import('vue').Ref<boolean>,
 *   quotaExceeded: import('vue').Ref<boolean>,
 *   place: import('vue').ComputedRef<string>,
 *   localeTick: import('vue').Ref<number>,
 *   timers: { set: Function, clear: Function },
 * }} deps
 */
export function useMatchStage(deps) {
  /** intro | striking | burning | failed */
  const stage = ref('intro')
  /** idle | striking | lit | failed */
  const firePhase = ref('idle')
  const igniting = ref(false)
  const grow = ref(false)
  const flash = ref(false)
  const showReadout = ref(false)
  const showFoot = ref(false)
  const showShareBtn = ref(false)
  const animatedCount = ref(0)
  const countReady = ref(false)
  /** @type {import('vue').Ref<{ textKey: string, n?: string } | null>} */
  const historyDelta = ref(null)

  let cancelCountAnim = null
  let igniteToken = 0
  let alive = true

  onUnmounted(() => {
    alive = false
    igniteToken += 1
    cancelCountAnim?.()
    cancelCountAnim = null
  })

  const matchInfo = computed(() =>
    calcMatchEquivalents({
      pm25: deps.air.value?.pm25,
      aqi: deps.air.value?.aqi,
    }),
  )

  const mode = computed(() =>
    resolveFireMode({
      matchesPerHour: matchInfo.value.matchesPerHour,
      aqi: deps.air.value?.aqi,
      concentration: matchInfo.value.concentration,
    }),
  )

  const displayCount = computed(() => {
    void deps.localeTick.value
    if (deps.quotaExceeded.value) return '–'
    if (deps.error.value && stage.value === 'failed') return '–'
    if (!countReady.value && !showReadout.value) return '0'
    return formatMatchCount(animatedCount.value)
  })

  const subtitle = computed(() => {
    void deps.localeTick.value
    if (deps.quotaExceeded.value) return t('quotaTitle')
    if (deps.error.value && stage.value === 'failed') return t('fail')
    if (stage.value !== 'burning') return ''
    if (matchInfo.value.offScale) return t('offScale')
    if (mode.value === 'bonfire') return t('modeBonfire')
    if (mode.value === 'cluster') return t('modeCluster')
    return t('modeMatch')
  })

  const historyLine = computed(() => {
    void deps.localeTick.value
    const d = historyDelta.value
    if (!d?.textKey) return ''
    return t(d.textKey, d.n != null ? { n: d.n } : undefined)
  })

  const liveMessage = computed(() => {
    void deps.localeTick.value
    if (deps.quotaExceeded.value) return t('quotaTitle')
    if (stage.value === 'failed') return t('failHint')
    if (stage.value === 'burning' && showReadout.value) {
      return `${displayCount.value} ${t('unit')}`
    }
    return ''
  })

  function startCountUp(to) {
    cancelCountAnim?.()
    const target = Number(to)
    if (!Number.isFinite(target)) {
      animatedCount.value = 0
      countReady.value = true
      return
    }
    animatedCount.value = 0
    countReady.value = false
    cancelCountAnim = animateNumber({
      from: 0,
      to: target,
      duration: 1500,
      onUpdate: (v) => {
        if (!alive) return
        animatedCount.value = v
      },
      onComplete: () => {
        if (!alive) return
        animatedCount.value = target
        countReady.value = true
      },
    })
  }

  function cancelCountUp() {
    cancelCountAnim?.()
    cancelCountAnim = null
  }

  function rememberHistory() {
    if (!deps.place.value || deps.error.value || deps.quotaExceeded.value) {
      historyDelta.value = null
      return
    }
    const delta = compareAndStore({
      city: deps.place.value,
      matches: matchInfo.value.matchesPerHour,
    })
    historyDelta.value = delta || null
  }

  function enterQuotaFailed() {
    stage.value = 'failed'
    firePhase.value = 'failed'
    showReadout.value = true
    showFoot.value = true
  }

  function stillIgniting(token) {
    return alive && token === igniteToken
  }

  async function ignite() {
    if (igniting.value || stage.value === 'burning' || stage.value === 'failed') return
    if (deps.quotaExceeded.value) {
      showReadout.value = true
      showFoot.value = true
      return
    }

    const token = ++igniteToken
    igniting.value = true

    try {
      const start = Date.now()
      while (deps.loading.value && Date.now() - start < 4000) {
        if (!stillIgniting(token)) return
        await sleep(80)
      }
      if (!stillIgniting(token)) return

      if (deps.quotaExceeded.value) {
        enterQuotaFailed()
        return
      }

      if (deps.error.value || (!deps.air.value && !deps.loading.value)) {
        stage.value = 'striking'
        firePhase.value = 'striking'
        await playStrike()
        if (!stillIgniting(token)) return
        await sleep(520)
        if (!stillIgniting(token)) return
        firePhase.value = 'failed'
        stage.value = 'failed'
        showReadout.value = true
        showFoot.value = true
        deps.timers.set('foot', () => {
          if (alive) showFoot.value = false
        }, 3600)
        return
      }

      const clean = matchInfo.value.isClean

      if (clean) {
        stage.value = 'striking'
        firePhase.value = 'striking'
        await playStrike()
        if (!stillIgniting(token)) return
        await sleep(380)
        if (!stillIgniting(token)) return
        firePhase.value = 'lit'
        stage.value = 'burning'
        grow.value = false
        showReadout.value = true
        startCountUp(matchInfo.value.matchesPerHour)
        rememberHistory()
        showFoot.value = true
        deps.timers.set('foot', () => {
          if (alive) showFoot.value = false
        }, 2800)
        deps.timers.set('share', () => {
          if (alive) showShareBtn.value = true
        }, 900)
        return
      }

      stage.value = 'striking'
      firePhase.value = 'striking'
      flash.value = true
      deps.timers.set('flash', () => {
        if (alive) flash.value = false
      }, 180)
      await playStrike()
      if (!stillIgniting(token)) return
      await sleep(720)
      if (!stillIgniting(token)) return

      firePhase.value = 'lit'
      stage.value = 'burning'
      grow.value = false

      showReadout.value = true
      startCountUp(matchInfo.value.matchesPerHour)
      rememberHistory()

      await sleep(420)
      if (!stillIgniting(token)) return
      grow.value = true

      showFoot.value = true
      deps.timers.set('foot', () => {
        if (alive) showFoot.value = false
      }, 3200)

      deps.timers.set('share', () => {
        if (alive) showShareBtn.value = true
      }, 1600)
    } finally {
      if (token === igniteToken) igniting.value = false
    }
  }

  function onMatchesChanged(n) {
    if (stage.value === 'burning' && showReadout.value && !deps.error.value && alive) {
      startCountUp(n)
      grow.value = true
    }
  }

  function refreshBurningReadout() {
    if (!alive) return
    startCountUp(matchInfo.value.matchesPerHour)
    rememberHistory()
  }

  return {
    stage,
    firePhase,
    igniting,
    grow,
    flash,
    showReadout,
    showFoot,
    showShareBtn,
    animatedCount,
    countReady,
    historyDelta,
    matchInfo,
    mode,
    displayCount,
    subtitle,
    historyLine,
    liveMessage,
    startCountUp,
    cancelCountUp,
    rememberHistory,
    enterQuotaFailed,
    ignite,
    onMatchesChanged,
    refreshBurningReadout,
  }
}
