<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import MatchScene from './components/MatchScene.vue'
import ShareSheet from './components/ShareSheet.vue'
import { detectLocation } from './services/location'
import { fetchAirQuality } from './services/airQuality'
import { fetchWeather, weatherToStyle } from './services/weather'
import { calcMatchEquivalents, formatMatchCount } from './utils/aqi'
import { animateNumber, sleep } from './utils/animate'
import { daypartStyle } from './utils/daypart'
import { compareAndStore } from './utils/history'
import { formatUpdatedLine } from './utils/time'
import { createDevProbe } from './utils/debug'
import { sanitizeError } from './utils/safe'
import { localizeCity } from './utils/city'
import { resolveFireMode } from './utils/fireMode'
import { getLocale, initI18n, onLocaleChange, setLocale, t } from './i18n'
import {
  loadSoundPreference,
  setSoundEnabled,
  unlockAudio,
  playStrike,
  disposeAudio,
} from './services/audio'

const probe = createDevProbe()

/** intro | striking | burning | failed */
const stage = ref('intro')
/** idle | striking | lit | failed */
const firePhase = ref('idle')
const loading = ref(true)
const error = ref('')
const location = ref(null)
const air = ref(null)
const weather = ref({ wind: 0, humidity: 50 })
const soundOn = ref(true)
const igniting = ref(false)
const entered = ref(false)
const grow = ref(false)
const flash = ref(false)
const showReadout = ref(false)
const showFoot = ref(false)
const showShareBtn = ref(false)
const shareOpen = ref(false)
const shareHint = ref('')
const guideOn = ref(false)
const offline = ref(false)
const animatedCount = ref(0)
const countReady = ref(false)
const historyLine = ref('')
const localeTick = ref(0)
const dayStyle = ref(daypartStyle())

let cancelCountAnim = null
let footTimer = 0
let shareTimer = 0
let hintTimer = 0
let guideTimer = 0
let dayTimer = 0
let loadPromise = null
let loadSeq = 0
let lastLoadAt = 0
const LOAD_COOLDOWN_MS = 12 * 1000

const matchInfo = computed(() =>
  calcMatchEquivalents({
    pm25: air.value?.pm25,
    aqi: air.value?.aqi,
  }),
)

const mode = computed(() =>
  resolveFireMode({
    matchesPerHour: matchInfo.value.matchesPerHour,
    aqi: air.value?.aqi,
    concentration: matchInfo.value.concentration,
  }),
)

const wxStyle = computed(() => weatherToStyle(weather.value || {}))

const appStyle = computed(() => ({
  ...dayStyle.value,
  ...wxStyle.value,
}))

const displayCount = computed(() => {
  void localeTick.value
  if (error.value && stage.value === 'failed') return '–'
  if (!countReady.value && !showReadout.value) return '0'
  return formatMatchCount(animatedCount.value)
})

const place = computed(() => {
  void localeTick.value
  if (loading.value && !location.value) return ''
  return localizeCity(location.value?.city, getLocale())
})

const subtitle = computed(() => {
  void localeTick.value
  if (error.value && stage.value === 'failed') return t('fail')
  if (stage.value !== 'burning') return ''
  if (mode.value === 'bonfire') return t('modeBonfire')
  if (mode.value === 'cluster') return t('modeCluster')
  return t('modeMatch')
})

const updatedLine = computed(() => {
  void localeTick.value
  if (!air.value?.updatedAt) return ''
  return formatUpdatedLine(air.value.updatedAt)
})

const liveMessage = computed(() => {
  void localeTick.value
  if (stage.value === 'failed') return t('failHint')
  if (stage.value === 'burning' && showReadout.value) {
    return `${displayCount.value} ${t('unit')}`
  }
  return ''
})

const sharePayload = computed(() => ({
  place: place.value,
  matchCount: matchInfo.value.matchesPerHour,
  pm25: air.value?.pm25 ?? null,
  aqi: air.value?.aqi ?? null,
  mode: mode.value,
  intensity: matchInfo.value.burnIntensity,
  brand: t('brand'),
  unit: t('unit'),
  modeLabel: subtitle.value,
  foot: t('foot'),
}))

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
      animatedCount.value = v
    },
    onComplete: () => {
      animatedCount.value = target
      countReady.value = true
    },
  })
}

function flashHint(text) {
  shareHint.value = text
  window.clearTimeout(hintTimer)
  hintTimer = window.setTimeout(() => {
    shareHint.value = ''
  }, 1800)
}

function rememberHistory() {
  if (!place.value || error.value) return
  const delta = compareAndStore({
    city: place.value,
    matches: matchInfo.value.matchesPerHour,
  })
  if (!delta) {
    historyLine.value = ''
    return
  }
  historyLine.value = t(delta.textKey, delta.n != null ? { n: delta.n } : undefined)
}

async function loadData(options = {}) {
  const force = Boolean(options.force)

  // 非强制：复用进行中的请求
  if (loadPromise && !force) return loadPromise

  if (!force && lastLoadAt && Date.now() - lastLoadAt < LOAD_COOLDOWN_MS && (air.value || location.value)) {
    loading.value = false
    if (options.fromUser) flashHint(t('waitCooldown'))
    return
  }

  const seq = ++loadSeq
  loading.value = true
  if (force) error.value = ''

  const run = (async () => {
    try {
      offline.value = typeof navigator !== 'undefined' && navigator.onLine === false
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
      if (
        !Number.isFinite(loc.lat) ||
        !Number.isFinite(loc.lon) ||
        (Math.abs(loc.lat) < 1e-6 && Math.abs(loc.lon) < 1e-6)
      ) {
        throw new Error('coords')
      }

      // 天气失败不挡空气；空气失败才算整体失败
      const wxP = fetchWeather({
        lat: loc.lat,
        lon: loc.lon,
        adcode: loc.adcode || '',
        force,
      }).catch(() => ({ wind: 0, humidity: 50, source: '' }))

      const aq = await fetchAirQuality({ lat: loc.lat, lon: loc.lon, force })
      const wx = await wxP
      if (seq !== loadSeq) return

      if (aq?.aqi == null && aq?.pm25 == null) {
        throw new Error('air empty')
      }

      air.value = aq
      weather.value = wx
      lastLoadAt = Date.now()
      error.value = ''
      probe.note('loaded', {
        source: aq.source,
        weather: wx.source,
        city: loc.city,
        aqi: aq.aqi,
        pm25: aq.pm25,
      })
      if (options.fromUser) flashHint(t('refreshed'))
    } catch (e) {
      if (seq !== loadSeq) return
      // 强刷失败时清掉过期读数，避免一直显示假 0
      if (force) air.value = null
      error.value = sanitizeError(e, 'fail')
      probe.note('load-fail', error.value)
    } finally {
      // 仅最新一次负责收尾 loading
      if (seq === loadSeq) {
        loading.value = false
        loadPromise = null
      }
    }
  })()

  loadPromise = run
  return run
}

async function softRefresh() {
  if (lastLoadAt && Date.now() - lastLoadAt < LOAD_COOLDOWN_MS && !error.value) {
    flashHint(t('waitCooldown'))
    return
  }
  await loadData({ force: true, fromUser: true })
  if (stage.value === 'burning' && !error.value && air.value) {
    startCountUp(matchInfo.value.matchesPerHour)
    rememberHistory()
  }
}

async function toggleSound() {
  await unlockAudio()
  soundOn.value = setSoundEnabled(!soundOn.value)
}

function toggleLang() {
  const next = getLocale() === 'zh' ? 'en' : 'zh'
  setLocale(next)
  localeTick.value += 1
}

function openShare() {
  if (stage.value !== 'burning' || error.value) return
  shareOpen.value = true
}

function onShareDone(method) {
  if (method === 'share') flashHint(t('shared'))
  else if (method === 'download') flashHint(t('saved'))
  else if (method === 'fail') flashHint(t('shareFail'))
}

async function ignite() {
  if (igniting.value || stage.value === 'burning' || stage.value === 'failed') return
  igniting.value = true
  guideOn.value = false
  await unlockAudio()

  const start = Date.now()
  while (loading.value && Date.now() - start < 4000) {
    await sleep(80)
  }

  if (error.value || (!air.value && !loading.value)) {
    stage.value = 'striking'
    firePhase.value = 'striking'
    await playStrike()
    await sleep(520)
    firePhase.value = 'failed'
    stage.value = 'failed'
    showReadout.value = true
    showFoot.value = true
    window.clearTimeout(footTimer)
    footTimer = window.setTimeout(() => {
      showFoot.value = false
    }, 3600)
    igniting.value = false
    return
  }

  const clean = matchInfo.value.isClean

  if (clean) {
    // 极净：轻触即止，不闪全屏、不旺烧再熄
    stage.value = 'striking'
    firePhase.value = 'striking'
    await playStrike()
    await sleep(380)
    firePhase.value = 'lit'
    stage.value = 'burning'
    grow.value = false
    showReadout.value = true
    startCountUp(matchInfo.value.matchesPerHour)
    rememberHistory()
    showFoot.value = true
    window.clearTimeout(footTimer)
    footTimer = window.setTimeout(() => {
      showFoot.value = false
    }, 2800)
    window.clearTimeout(shareTimer)
    shareTimer = window.setTimeout(() => {
      showShareBtn.value = true
    }, 900)
    igniting.value = false
    return
  }

  stage.value = 'striking'
  firePhase.value = 'striking'
  flash.value = true
  window.setTimeout(() => {
    flash.value = false
  }, 180)
  await playStrike()
  await sleep(720)

  firePhase.value = 'lit'
  stage.value = 'burning'
  grow.value = false

  showReadout.value = true
  startCountUp(matchInfo.value.matchesPerHour)
  rememberHistory()

  await sleep(420)
  grow.value = true

  showFoot.value = true
  window.clearTimeout(footTimer)
  footTimer = window.setTimeout(() => {
    showFoot.value = false
  }, 3200)

  window.clearTimeout(shareTimer)
  shareTimer = window.setTimeout(() => {
    showShareBtn.value = true
  }, 1600)

  igniting.value = false
}

function onKeydown(e) {
  if (e.key === 'Enter' || e.key === ' ') {
    if (stage.value === 'intro' && !igniting.value) {
      e.preventDefault()
      ignite()
    }
  }
  if ((e.key === 'l' || e.key === 'L') && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    toggleLang()
  }
}

watch(
  () => matchInfo.value.matchesPerHour,
  (n) => {
    if (stage.value === 'burning' && showReadout.value && !error.value) {
      startCountUp(n)
      grow.value = true
    }
  },
)

onMounted(async () => {
  initI18n()
  localeTick.value += 1
  onLocaleChange(() => {
    localeTick.value += 1
  })

  soundOn.value = loadSoundPreference()
  setSoundEnabled(soundOn.value)

  offline.value = typeof navigator !== 'undefined' && navigator.onLine === false
  window.addEventListener('online', () => {
    offline.value = false
  })
  window.addEventListener('offline', () => {
    offline.value = true
  })
  window.addEventListener('keydown', onKeydown)

  dayStyle.value = daypartStyle()
  dayTimer = window.setInterval(() => {
    dayStyle.value = daypartStyle()
  }, 10 * 60 * 1000)

  loadData()
  await sleep(40)
  entered.value = true

  try {
    if (!localStorage.getItem('pm25-guided')) {
      guideOn.value = true
      guideTimer = window.setTimeout(() => {
        guideOn.value = false
        try {
          localStorage.setItem('pm25-guided', '1')
        } catch {
          /* ignore */
        }
      }, 2200)
    }
  } catch {
    /* ignore */
  }

  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/sw.js')
    } catch {
      /* ignore */
    }
  }
})

onUnmounted(() => {
  cancelCountAnim?.()
  window.clearTimeout(footTimer)
  window.clearTimeout(shareTimer)
  window.clearTimeout(hintTimer)
  window.clearTimeout(guideTimer)
  window.clearInterval(dayTimer)
  window.removeEventListener('keydown', onKeydown)
  disposeAudio()
})
</script>

<template>
  <div
    class="app"
    :class="{ entered, flash, burning: stage === 'burning', failed: stage === 'failed' }"
    :style="appStyle"
  >
    <div class="warm-flash" aria-hidden="true" />
    <div class="day-veil" aria-hidden="true" />

    <div class="sr-only" aria-live="polite">{{ liveMessage }}</div>

    <header class="top">
      <button
        type="button"
        class="place"
        :class="{ show: place && entered }"
        :title="t('refreshed')"
        @click="softRefresh"
      >
        {{ place || ' ' }}
      </button>

      <div class="top-actions">
        <button
          class="icon-btn"
          type="button"
          :class="{ visible: true }"
          :aria-label="getLocale() === 'zh' ? 'English' : '中文'"
          @click="toggleLang"
        >
          <span class="lang">{{ getLocale() === 'zh' ? 'EN' : '中' }}</span>
        </button>

        <button
          class="icon-btn"
          type="button"
          :class="{ visible: showShareBtn && stage === 'burning' }"
          :disabled="!(showShareBtn && stage === 'burning')"
          :tabindex="showShareBtn && stage === 'burning' ? 0 : -1"
          :aria-hidden="!(showShareBtn && stage === 'burning')"
          :aria-label="t('share')"
          @click="openShare"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
            <circle cx="7" cy="12" r="2.15" stroke="currentColor" stroke-width="1.6" />
            <circle cx="17" cy="7" r="2.15" stroke="currentColor" stroke-width="1.6" />
            <circle cx="17" cy="17" r="2.15" stroke="currentColor" stroke-width="1.6" />
            <path
              d="M9.1 11.1l5.8-3.2M9.1 12.9l5.8 3.2"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
            />
          </svg>
        </button>

        <button
          class="icon-btn visible"
          type="button"
          :aria-pressed="soundOn"
          :aria-label="soundOn ? t('soundOn') : t('soundOff')"
          @click="toggleSound"
        >
          <svg v-if="soundOn" viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
            <path d="M4 10v4h3l4 3V7L7 10H4z" fill="currentColor" />
            <path d="M15 9.5c1.2 1 1.2 4 0 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
            <path d="M17.5 7c2.2 2 2.2 8 0 10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          </svg>
          <svg v-else viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
            <path d="M4 10v4h3l4 3V7L7 10H4z" fill="currentColor" />
            <path d="M16 10l4 4M20 10l-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          </svg>
        </button>
      </div>
    </header>

    <main class="stage">
      <div class="scene-wrap">
        <MatchScene
          :phase="firePhase"
          :match-count="matchInfo.matchesPerHour"
          :intensity="matchInfo.burnIntensity"
          :mode="mode"
          :grow="grow"
          :wind="Number(wxStyle['--wind'] || 0)"
          :smoke-weight="Number(wxStyle['--smoke-weight'] || 1)"
          :smoke-slow="Number(wxStyle['--smoke-slow'] || 1)"
        />
      </div>

      <button
        v-if="stage === 'intro'"
        class="ignite"
        type="button"
        :disabled="igniting"
        :aria-label="t('ignite')"
        @click="ignite"
      >
        <span class="ignite-dot" />
        <span>{{ loading ? t('loading') : t('ignite') }}</span>
      </button>

      <div class="readout" :class="{ show: showReadout || stage === 'failed' }">
        <div class="count">
          <span class="num">{{ displayCount }}</span>
          <span class="unit">{{ t('unit') }}</span>
        </div>
        <div class="meta">
          <span v-if="stage === 'failed'">{{ t('failHint') }}</span>
          <template v-else>
            <span v-if="air?.pm25 != null">PM2.5 {{ Math.round(air.pm25) }}</span>
            <span v-else-if="air?.aqi != null">AQI {{ air.aqi }}</span>
            <span
              v-if="air?.pm25 != null && air?.aqi != null"
              class="sep"
            >AQI {{ air.aqi }}</span>
            <span v-if="subtitle" class="sep">{{ subtitle }}</span>
          </template>
        </div>
        <div v-if="updatedLine && stage === 'burning'" class="submeta">{{ updatedLine }}</div>
        <div v-if="historyLine && stage === 'burning'" class="submeta">{{ historyLine }}</div>
        <div v-if="offline" class="submeta">{{ t('offline') }}</div>
      </div>
    </main>

    <footer class="foot" :class="{ show: showFoot || !!shareHint || guideOn }">
      {{ shareHint || (guideOn ? t('guide') : stage === 'failed' ? t('failHint') : t('foot')) }}
    </footer>

    <ShareSheet
      :open="shareOpen"
      :payload="sharePayload"
      @close="shareOpen = false"
      @done="onShareDone"
    />
  </div>
</template>

<style scoped>
.app {
  position: relative;
  height: 100%;
  min-height: 100dvh;
  max-width: 100vw;
  display: grid;
  grid-template-rows: auto 1fr auto;
  padding:
    calc(18px + var(--safe-top))
    calc(18px + var(--safe-right))
    calc(24px + var(--safe-bottom))
    calc(18px + var(--safe-left));
  background: #fff;
  color: #111;
  overflow-x: clip;
  opacity: 0;
  transform: translateY(8px);
  transition:
    opacity 0.7s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.7s cubic-bezier(0.22, 1, 0.36, 1);
}

.app.entered {
  opacity: 1;
  transform: none;
}

.day-veil {
  pointer-events: none;
  position: fixed;
  inset: 0;
  z-index: 0;
  background: rgba(255, 170, 90, var(--day-warm, 0));
}

.warm-flash {
  pointer-events: none;
  position: fixed;
  inset: 0;
  z-index: 40;
  background: radial-gradient(circle at 50% 58%, rgba(255, 150, 70, 0.14), transparent 55%);
  opacity: 0;
  transition: opacity 0.18s ease;
}

.app.flash .warm-flash {
  opacity: 1;
}

.top {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  height: 44px;
  max-width: 100%;
}

.place {
  flex: 0 1 auto;
  min-width: 0;
  max-width: min(46vw, 180px);
  height: 44px;
  padding: 0 4px 0 0;
  display: inline-block;
  width: fit-content;
  font-size: 0.92rem;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: var(--text-soft);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0;
  transition: opacity 0.7s cubic-bezier(0.22, 1, 0.36, 1) 0.12s;
  text-align: left;
  line-height: 44px;
}

.place.show {
  opacity: 1;
}

.top-actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  height: 44px;
  gap: 0;
  min-width: 0;
}

.icon-btn {
  box-sizing: border-box;
  width: 40px;
  height: 40px;
  margin: 0;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: var(--text-soft);
  line-height: 0;
  flex: 0 0 auto;
  opacity: 0;
  pointer-events: none;
  overflow: hidden;
  transition:
    color 0.2s ease,
    background 0.2s ease,
    opacity 0.35s ease,
    width 0.25s ease;
}

.icon-btn:not(.visible) {
  width: 0;
  opacity: 0;
  pointer-events: none;
}

.icon-btn.visible {
  opacity: 1;
  pointer-events: auto;
}

.icon-btn.visible:disabled {
  opacity: 0.35;
  pointer-events: none;
}

.icon-btn:hover:not(:disabled) {
  color: #111;
  background: rgba(0, 0, 0, 0.04);
}

.icon-btn svg {
  display: block;
}

.lang {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  line-height: 1;
}

.stage {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(8px, 1.4vh, 18px);
  min-width: 0;
  min-height: 0;
  max-width: 100%;
  padding: 4px 0 0;
  overflow: visible;
}

.scene-wrap {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow: visible;
  transform: translateY(6px) scale(0.975);
  opacity: 0.92;
  filter: hue-rotate(calc((var(--flame-hue, 1) - 1) * 18deg))
    saturate(var(--flame-sat, 1));
  transition:
    transform 0.9s cubic-bezier(0.22, 1, 0.36, 1) 0.05s,
    opacity 0.9s ease 0.05s;
}

.app.entered .scene-wrap {
  transform: none;
  opacity: 1;
}

.ignite {
  position: absolute;
  bottom: max(6%, 18px);
  display: inline-flex;
  align-items: center;
  gap: 12px;
  padding: 14px 28px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: #fff;
  color: #111;
  font-size: 1.05rem;
  font-weight: 500;
  letter-spacing: 0.28em;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.045);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    opacity 0.35s ease;
  animation: ignite-in 0.7s cubic-bezier(0.22, 1, 0.36, 1) 0.25s both;
}

.ignite:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 16px 44px rgba(0, 0, 0, 0.07);
}

.ignite:active:not(:disabled) {
  transform: scale(0.98);
}

.ignite:disabled {
  opacity: 0.55;
}

.ignite:focus-visible,
.icon-btn:focus-visible,
.place:focus-visible {
  outline: 2px solid rgba(17, 17, 17, 0.25);
  outline-offset: 2px;
}

.ignite-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--flame);
  box-shadow: 0 0 0 0 rgba(255, 106, 26, 0.4);
  animation: pulse-dot 1.8s ease-out infinite;
}

.readout {
  text-align: center;
  margin-top: -6px;
  opacity: 0;
  transform: translateY(14px);
  filter: blur(6px);
  transition:
    opacity 0.9s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.9s cubic-bezier(0.22, 1, 0.36, 1),
    filter 0.9s cubic-bezier(0.22, 1, 0.36, 1);
  pointer-events: none;
}

.readout.show {
  opacity: 1;
  transform: translateY(-6px);
  filter: blur(0);
}

.count {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 12px;
}

.num {
  font-family: var(--mono);
  font-size: clamp(3.4rem, 12vw, 5.4rem);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.05em;
  line-height: 0.95;
  color: #111;
}

.unit {
  font-size: 1.05rem;
  color: var(--text-soft);
  letter-spacing: 0.06em;
}

.meta,
.submeta {
  margin-top: 10px;
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 10px 14px;
  color: var(--text-faint);
  font-size: 0.86rem;
  letter-spacing: 0.1em;
}

.meta {
  opacity: 0;
  transform: translateY(6px);
  transition:
    opacity 0.7s ease 0.35s,
    transform 0.7s ease 0.35s;
}

.readout.show .meta {
  opacity: 1;
  transform: none;
}

.submeta {
  margin-top: 6px;
  font-size: 0.78rem;
  opacity: 0.9;
}

.meta .sep::before {
  content: '·';
  margin-right: 14px;
  color: #ddd;
}

.foot {
  position: relative;
  z-index: 1;
  text-align: center;
  font-size: 0.8rem;
  letter-spacing: 0.2em;
  color: var(--text-faint);
  opacity: 0;
  transform: translateY(4px);
  transition:
    opacity 1s ease,
    transform 1s ease;
  min-height: 1.2em;
  margin-bottom: 8px;
}

.foot.show {
  opacity: 1;
  transform: none;
}

@keyframes ignite-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes pulse-dot {
  0% {
    box-shadow: 0 0 0 0 rgba(255, 106, 26, 0.4);
  }
  70% {
    box-shadow: 0 0 0 14px rgba(255, 106, 26, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(255, 106, 26, 0);
  }
}

@media (max-width: 480px) {
  .app {
    padding-left: calc(14px + var(--safe-left));
    padding-right: calc(14px + var(--safe-right));
  }

  .top,
  .place,
  .top-actions {
    height: 40px;
  }

  .place {
    max-width: min(42vw, 140px);
    line-height: 40px;
    font-size: 0.88rem;
  }

  .icon-btn {
    width: 36px;
    height: 36px;
  }

  .icon-btn:not(.visible) {
    width: 0;
  }

  .ignite {
    padding: 13px 24px;
    letter-spacing: 0.22em;
  }
}

@media (min-width: 960px) {
  .app {
    padding-left: calc(28px + var(--safe-left));
    padding-right: calc(28px + var(--safe-right));
  }

  .num {
    font-size: clamp(4.2rem, 7vw, 5.8rem);
  }
}

@media (prefers-reduced-motion: reduce) {
  .app,
  .scene-wrap,
  .place,
  .readout,
  .meta,
  .foot,
  .ignite,
  .warm-flash,
  .icon-btn {
    transition: none !important;
    animation: none !important;
  }

  .app {
    opacity: 1;
    transform: none;
  }

  .readout.show {
    filter: none;
  }
}
</style>
