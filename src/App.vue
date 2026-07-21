<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import MatchScene from './components/MatchScene.vue'
import ShareSheet from './components/ShareSheet.vue'
import SplashScreen from './components/SplashScreen.vue'
import { daypartStyle } from './utils/daypart'
import { formatUpdatedLine } from './utils/time'
import { sleep } from './utils/animate'
import { getLocale, initI18n, onLocaleChange, setLocale, t } from './i18n'
import {
  loadSoundPreference,
  setSoundEnabled,
  unlockAudio,
  disposeAudio,
} from './services/audio'
import { useTimers } from './composables/useTimers'
import { useAirQuality } from './composables/useAirQuality'
import { useMatchStage } from './composables/useMatchStage'
import { useAudioGesture } from './composables/useAudioGesture'

/** 开屏最长等待（毫秒）：网络挂起时仍进入主界面 */
const SPLASH_MAX_MS = 12_000

const timers = useTimers()

const shareOpen = ref(false)
const shareHint = ref('')
const guideOn = ref(false)
const entered = ref(false)
const soundOn = ref(true)
const dayStyle = ref(daypartStyle())

/** boot | ready | leaving */
const splashPhase = ref('boot')
/** 真实加载进度 0–1 */
const splashProgress = ref(0)
const splashStatus = ref('')
const splashMounted = ref(true)

const STAGE_I18N = {
  start: 'splashStart',
  location: 'splashLocation',
  air: 'splashAir',
  weather: 'splashWeather',
  place: 'splashPlace',
  fonts: 'splashStart',
  done: 'splashDone',
}

function onBootProgress({ stage: st, progress }) {
  if (splashPhase.value !== 'boot') return
  if (progress > splashProgress.value) splashProgress.value = progress
  const key = STAGE_I18N[st]
  if (key) splashStatus.value = t(key)
}

function flashHint(text) {
  shareHint.value = text
  timers.set('hint', () => {
    shareHint.value = ''
  }, 1800)
}

// match 在 airApi 之后赋值；配额回调经闭包延迟执行，安全
let enterQuotaFailedRef = () => {}

const airApi = useAirQuality({
  onFlashHint: flashHint,
  onQuotaExceeded: () => {
    enterQuotaFailedRef()
  },
  onLoadProgress: onBootProgress,
})

const {
  loading,
  error,
  air,
  offline,
  quotaExceeded,
  quotaLimit,
  localeTick,
  place,
  wxStyle,
  loadData,
  softRefresh: softRefreshAir,
  bumpLocale,
  syncOnlineStatus,
} = airApi

const match = useMatchStage({
  air,
  error,
  loading,
  quotaExceeded,
  place,
  localeTick,
  timers,
})

const {
  stage,
  firePhase,
  igniting,
  grow,
  flash,
  showReadout,
  showFoot,
  showShareBtn,
  matchInfo,
  mode,
  displayCount,
  subtitle,
  historyLine,
  liveMessage,
  ignite: runIgnite,
  onMatchesChanged,
  refreshBurningReadout,
  cancelCountUp,
  enterQuotaFailed,
} = match

enterQuotaFailedRef = enterQuotaFailed

useAudioGesture()

const appStyle = computed(() => ({
  ...dayStyle.value,
  ...wxStyle.value,
}))

const quotaHintLine = computed(() => {
  void localeTick.value
  return t('quotaHint', { n: quotaLimit.value || 200 })
})

const updatedLine = computed(() => {
  void localeTick.value
  if (!air.value?.updatedAt) return ''
  return formatUpdatedLine(air.value.updatedAt)
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

async function softRefresh() {
  await softRefreshAir({
    stage: stage.value,
    onBurningRefresh: refreshBurningReadout,
  })
}

async function toggleSound() {
  await unlockAudio()
  soundOn.value = setSoundEnabled(!soundOn.value)
}

function toggleLang() {
  const next = getLocale() === 'zh' ? 'en' : 'zh'
  setLocale(next)
  bumpLocale()
}

function openShare() {
  if (stage.value !== 'burning' || error.value || quotaExceeded.value) return
  shareOpen.value = true
}

function onShareDone(method) {
  if (method === 'share') flashHint(t('shared'))
  else if (method === 'download') flashHint(t('saved'))
  else if (method === 'fail') flashHint(t('shareFail'))
}

async function ignite() {
  guideOn.value = false
  await unlockAudio()
  await runIgnite()
}

function onKeydown(e) {
  if (e.key === 'Enter' || e.key === ' ') {
    if (stage.value === 'intro' && !igniting.value && !splashMounted.value) {
      e.preventDefault()
      ignite()
    }
  }
  if ((e.key === 'l' || e.key === 'L') && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    toggleLang()
  }
}

function onOnline() {
  offline.value = false
}

function onOffline() {
  offline.value = true
}

watch(
  () => matchInfo.value.matchesPerHour,
  (n) => onMatchesChanged(n),
)

watch(quotaExceeded, (v) => {
  if (v) enterQuotaFailed()
})

async function finishSplash() {
  if (!splashMounted.value) return
  splashProgress.value = 1
  splashStatus.value = t('splashDone')
  splashPhase.value = 'ready'
  await sleep(320)
  entered.value = true
  splashPhase.value = 'leaving'
  await sleep(560)
  splashMounted.value = false

  try {
    if (!localStorage.getItem('pm25-guided')) {
      guideOn.value = true
      timers.set('guide', () => {
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
}

/** 与数据加载并行：字体 / 静态资源 */
async function loadClientAssets() {
  onBootProgress({ stage: 'start', progress: 0.04 })
  const jobs = []

  if (typeof document !== 'undefined' && document.fonts?.ready) {
    jobs.push(
      document.fonts.ready
        .then(() => {
          onBootProgress({ stage: 'fonts', progress: 0.12 })
        })
        .catch(() => {}),
    )
  }

  if (typeof fetch === 'function') {
    jobs.push(
      fetch('/icon.svg', { cache: 'force-cache' })
        .then(() => {
          onBootProgress({ stage: 'start', progress: Math.max(splashProgress.value, 0.08) })
        })
        .catch(() => {}),
    )
  }

  if (jobs.length) await Promise.allSettled(jobs)
}

let offLocale = null

onMounted(async () => {
  initI18n()
  localeTick.value += 1
  splashStatus.value = t('splashStart')
  offLocale = onLocaleChange(() => {
    bumpLocale()
    // 开屏中切语言时更新状态文案
    if (splashPhase.value === 'boot' && splashStatus.value) {
      // 保持当前进度，仅刷新通用提示
      splashStatus.value = t('splashHint')
    }
  })

  soundOn.value = loadSoundPreference()
  setSoundEnabled(soundOn.value)

  syncOnlineStatus()
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  window.addEventListener('keydown', onKeydown)

  dayStyle.value = daypartStyle()
  timers.interval('daypart', () => {
    dayStyle.value = daypartStyle()
  }, 10 * 60 * 1000)

  const assetsP = loadClientAssets()
  const loadP = loadData().catch(() => {
    /* 失败也进主界面 */
  })

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }

  // 真实加载；超时则强制结束开屏，避免永久卡住
  let timedOut = false
  await Promise.race([
    Promise.all([loadP, assetsP]),
    sleep(SPLASH_MAX_MS).then(() => {
      timedOut = true
    }),
  ])

  if (timedOut && splashPhase.value === 'boot') {
    onBootProgress({ stage: 'done', progress: 1 })
  }

  await finishSplash()
})

onUnmounted(() => {
  cancelCountUp()
  offLocale?.()
  offLocale = null
  window.removeEventListener('online', onOnline)
  window.removeEventListener('offline', onOffline)
  window.removeEventListener('keydown', onKeydown)
  disposeAudio()
})
</script>

<template>
  <SplashScreen
    v-if="splashMounted"
    :phase="splashPhase"
    :progress="splashProgress"
    :status-text="splashStatus"
  />

  <div
    class="app"
    :class="{
      entered,
      flash,
      burning: stage === 'burning',
      failed: stage === 'failed',
      quota: quotaExceeded,
      'off-scale': matchInfo.offScale && stage === 'burning',
      'behind-splash': splashMounted && splashPhase === 'boot',
    }"
    :style="appStyle"
  >
    <div class="warm-flash" aria-hidden="true" />
    <div class="day-veil" aria-hidden="true" />

    <div class="sr-only" aria-live="polite" aria-atomic="true">{{ liveMessage }}</div>

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
      <div class="scene-wrap" aria-hidden="true">
        <MatchScene
          :phase="firePhase"
          :match-count="matchInfo.matchesPerHour"
          :intensity="matchInfo.burnIntensity"
          :clean="matchInfo.isClean"
          :off-scale="matchInfo.offScale"
          :mode="mode"
          :grow="grow"
          :wind="Number(wxStyle['--wind'] || 0)"
          :smoke-weight="Number(wxStyle['--smoke-weight'] || 1)"
          :smoke-slow="Number(wxStyle['--smoke-slow'] || 1)"
        />
      </div>

      <button
        v-if="stage === 'intro' && !splashMounted"
        class="ignite"
        type="button"
        :disabled="igniting"
        :aria-label="t('ignite')"
        @click="ignite"
      >
        <span class="ignite-dot" aria-hidden="true" />
        <span>{{ loading ? t('loading') : t('ignite') }}</span>
      </button>

      <div class="readout" :class="{ show: showReadout || stage === 'failed' || quotaExceeded }">
        <div class="count">
          <span class="num" :class="{ muted: quotaExceeded }">{{ displayCount }}</span>
          <span class="unit">{{ t('unit') }}</span>
        </div>
        <div class="meta">
          <span v-if="quotaExceeded">{{ t('quotaTitle') }}</span>
          <span v-else-if="stage === 'failed'">{{ t('failHint') }}</span>
          <template v-else>
            <span v-if="air?.pm25 != null">PM2.5 {{ Math.round(air.pm25) }}</span>
            <span v-else-if="air?.aqi != null">AQI {{ air.aqi }}</span>
            <span
              v-if="air?.pm25 != null && air?.aqi != null"
              class="sep"
            >AQI {{ air.aqi }}</span>
            <span v-if="subtitle" class="sep" :class="{ warn: matchInfo.offScale }">{{ subtitle }}</span>
          </template>
        </div>
        <div v-if="quotaExceeded" class="submeta">{{ quotaHintLine }}</div>
        <div v-else-if="matchInfo.offScale && stage === 'burning'" class="submeta warn">
          {{ t('offScaleHint') }}
        </div>
        <div v-if="updatedLine && stage === 'burning' && !quotaExceeded" class="submeta">{{ updatedLine }}</div>
        <div v-if="historyLine && stage === 'burning' && !quotaExceeded" class="submeta">{{ historyLine }}</div>
        <div v-if="offline && !quotaExceeded" class="submeta">{{ t('offline') }}</div>
      </div>
    </main>

    <footer class="foot" :class="{ show: showFoot || !!shareHint || guideOn || quotaExceeded }">
      {{
        shareHint ||
        (quotaExceeded
          ? t('quotaFoot')
          : guideOn
            ? t('guide')
            : stage === 'failed'
              ? t('failHint')
              : t('foot'))
      }}
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

.app.behind-splash {
  opacity: 0;
  pointer-events: none;
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

.num.muted {
  color: #bbb;
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

.meta .sep.warn,
.submeta.warn {
  color: #c45a2a;
}

.app.quota .scene-wrap {
  filter: grayscale(0.55) saturate(0.55);
  opacity: 0.88;
}

.app.off-scale .num {
  letter-spacing: -0.04em;
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
