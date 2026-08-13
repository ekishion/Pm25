<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import MatchScene from './components/MatchScene.vue'
import ShareSheet from './components/ShareSheet.vue'
import SplashScreen from './components/SplashScreen.vue'
import ParticleCanvas from './components/ParticleCanvas.vue'
import CustomCursor from './components/CustomCursor.vue'
import AppHeader from './components/AppHeader.vue'
import AirReadout from './components/AirReadout.vue'
import AppFooter from './components/AppFooter.vue'
import { daypartStyle } from './utils/daypart'
import { formatUpdatedLine } from './utils/time'
import { issueStamp as buildIssueStamp, formatCoords } from './utils/editorial'
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
import { usePrivacy } from './composables/usePrivacy'

/** 开屏最长等待（毫秒）：网络挂起时仍进入主界面 */
const SPLASH_MAX_MS = 12_000

const timers = useTimers()

const shareOpen = ref(false)
const shareHint = ref('')
const guideOn = ref(false)
const entered = ref(false)
const soundOn = ref(true)
const dayStyle = ref(daypartStyle())

const { privacyOn, loadPrivacyPreference, togglePrivacy } = usePrivacy()

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
  location,
  offline,
  quotaExceeded,
  quotaLimit,
  localeTick,
  place,
  wxStyle,
  loadData,
  locatePrecise,
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
  '--intensity': String(matchInfo.value?.burnIntensity ?? 0.2),
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

const footerLine = computed(() => {
  void localeTick.value
  if (shareHint.value) return shareHint.value
  if (quotaExceeded.value) return t('quotaFoot')
  if (guideOn.value) return t('guide')
  if (stage.value === 'failed') return t('failHint')
  return t('foot')
})

/** UI 展示用城市：隐私模式不显示真实地名 */
const displayPlace = computed(() => {
  void localeTick.value
  if (privacyOn.value) return t('privacyPlace')
  return place.value
})

const sharePayload = computed(() => ({
  place: privacyOn.value ? '' : place.value,
  matchCount: matchInfo.value.matchesPerHour,
  pm25: air.value?.pm25 ?? null,
  aqi: air.value?.aqi ?? null,
  mode: mode.value,
  intensity: matchInfo.value.burnIntensity,
  brand: t('brand'),
  unit: t('unit'),
  modeLabel: subtitle.value,
  overline: overlineLabel.value,
  foot: t('foot'),
  lat: privacyOn.value ? null : location.value?.lat ?? null,
  lon: privacyOn.value ? null : location.value?.lon ?? null,
  issue: issueStamp.value,
  privacy: privacyOn.value,
  hidePlace: privacyOn.value,
}))

/** 杂志刊号角标：MATCH · VOL. 年 + 日序 */
const issueStamp = computed(() => {
  void localeTick.value
  return buildIssueStamp()
})

/** 经纬度纪实角标（隐私模式不展示） */
const coordStamp = computed(() => {
  if (privacyOn.value) return ''
  return formatCoords(location.value?.lat, location.value?.lon)
})

const overlineLabel = computed(() => {
  void localeTick.value
  return t('editorialOverline')
})

/** 点击城市名：请求 GPS 精确定位并刷新（在用户手势内触发权限弹窗） */
let locateBusy = false
async function onPlaceClick() {
  if (locateBusy) return
  if (quotaExceeded.value) {
    flashHint(quotaHintLine.value)
    return
  }
  locateBusy = true
  flashHint(t('locating'))
  try {
    const gotGps = await locatePrecise({
      stage: stage.value,
      onBurningRefresh: refreshBurningReadout,
    })
    flashHint(gotGps ? t('located') : t('geoDenied'))
  } finally {
    locateBusy = false
  }
}

async function toggleSound() {
  await unlockAudio()
  soundOn.value = setSoundEnabled(!soundOn.value)
}

function onTogglePrivacy() {
  const on = togglePrivacy()
  flashHint(on ? t('privacyHint') : t('privacyShown'))
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
  await sleep(920)
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
  loadPrivacyPreference()

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
  <ParticleCanvas
    :intensity="matchInfo?.burnIntensity ?? 0.2"
    :active="entered && !splashMounted"
  />
  <CustomCursor :intensity="matchInfo?.burnIntensity ?? 0.2" />

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
    <div class="ember-glow" aria-hidden="true" />

    <div class="sr-only" aria-live="polite" aria-atomic="true">{{ liveMessage }}</div>

    <AppHeader
      :place="displayPlace"
      :privacy-on="privacyOn"
      :entered="entered"
      :splash-mounted="splashMounted"
      :issue-stamp="issueStamp"
      :show-share-btn="showShareBtn"
      :stage="stage"
      :sound-on="soundOn"
      @place-click="onPlaceClick"
      @toggle-privacy="onTogglePrivacy"
      @toggle-lang="toggleLang"
      @share="openShare"
      @toggle-sound="toggleSound"
    />

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

      <AirReadout
        :visible="showReadout || stage === 'failed' || quotaExceeded"
        :reveal="showReadout && stage === 'burning' && !quotaExceeded"
        :stage="stage"
        :quota-exceeded="quotaExceeded"
        :off-scale="matchInfo.offScale"
        :overline="overlineLabel"
        :display-count="displayCount"
        :unit="t('unit')"
        :subtitle="subtitle"
        :pm25="air?.pm25"
        :aqi="air?.aqi"
        :quota-hint="quotaHintLine"
        :history-line="historyLine"
        :updated-line="updatedLine"
        :offline="offline"
      />
    </main>

    <AppFooter
      :foot="footerLine"
      :foot-visible="showFoot || !!shareHint || guideOn || quotaExceeded"
      :coords="coordStamp"
      :coords-visible="entered && !!coordStamp && !splashMounted && !(showFoot || shareHint || guideOn)"
    />

    <ShareSheet
      :open="shareOpen"
      :payload="sharePayload"
      :privacy="privacyOn"
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
  grid-template-rows: auto minmax(0, 1fr) auto;
  padding:
    calc(14px + var(--safe-top))
    calc(18px + var(--safe-right))
    calc(14px + var(--safe-bottom))
    calc(18px + var(--safe-left));
  background: var(--bg);
  color: var(--text);
  overflow: hidden;
  opacity: 0;
  transform: translateY(12px) scale(0.98);
  filter: blur(4px);
  transition:
    opacity 1s var(--ease-out),
    transform 1s var(--ease-out),
    filter 1.2s var(--ease-out);
}

.app.entered {
  opacity: 1;
  transform: none;
  filter: blur(0);
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

.ember-glow {
  pointer-events: none;
  position: absolute;
  left: 50%;
  top: 42%;
  z-index: 0;
  width: min(640px, 80vw);
  height: min(360px, 40vh);
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: radial-gradient(
    ellipse at center,
    rgba(var(--flame-rgb), calc(0.04 + var(--intensity, 0.2) * 0.05)) 0%,
    transparent 72%
  );
  filter: blur(10px);
  opacity: 0;
  transition: opacity 1.2s ease;
}

.app.burning .ember-glow,
.app.failed .ember-glow {
  opacity: 1;
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

.stage {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(6px, 1.2vh, 14px);
  min-width: 0;
  min-height: 0;
  max-width: 100%;
  padding: 0 0 4px;
  overflow: hidden;
}

.scene-wrap {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  flex: 0 1 auto;
  max-height: min(52vh, 420px);
  overflow: hidden;
  transform: translateY(10px) scale(0.96);
  opacity: 0;
  filter: hue-rotate(calc((var(--flame-hue, 1) - 1) * 18deg))
    saturate(var(--flame-sat, 1))
    blur(3px);
  transition:
    transform 1.2s var(--ease-out) 0.1s,
    opacity 1s ease 0.1s,
    filter 1.4s ease 0.1s;
}

.app.entered .scene-wrap {
  transform: none;
  opacity: 1;
  filter: hue-rotate(calc((var(--flame-hue, 1) - 1) * 18deg))
    saturate(var(--flame-sat, 1))
    blur(0);
}

.ignite {
  position: relative;
  margin-top: 4px;
  display: inline-flex;
  align-items: center;
  gap: 12px;
  padding: 14px 30px;
  border-radius: 999px;
  border: 1px solid var(--glass-border);
  background: var(--glass-bg-strong);
  color: var(--text);
  font-size: 0.95rem;
  font-weight: 500;
  letter-spacing: 0.32em;
  backdrop-filter: blur(32px) saturate(180%);
  -webkit-backdrop-filter: blur(32px) saturate(180%);
  box-shadow:
    0 12px 40px rgba(0, 0, 0, 0.06),
    inset 0 1px 0 var(--glass-inner);
  transition:
    transform 0.5s var(--ease-spring),
    box-shadow 0.4s ease,
    opacity 0.35s ease;
  animation: ignite-in 0.7s var(--ease-out) 0.25s both;
}

.ignite:hover:not(:disabled) {
  transform: translateY(-3px) scale(1.03);
  box-shadow:
    0 20px 50px rgba(var(--flame-rgb), 0.16),
    inset 0 1px 0 var(--glass-inner),
    0 0 32px rgba(var(--flame-rgb), 0.1);
}

.ignite:active:not(:disabled) {
  transform: scale(0.96);
  transition-duration: 0.12s;
}

.ignite:disabled {
  opacity: 0.55;
}

.ignite:focus-visible,
.icon-btn:focus-visible,
.place:focus-visible {
  outline: 2px solid var(--ink-faint);
  outline-offset: 2px;
}

.ignite-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--flame);
  box-shadow: 0 0 0 0 rgba(var(--flame-rgb), 0.4);
  animation: pulse-dot 1.8s ease-out infinite;
}

.app.quota .scene-wrap {
  filter: grayscale(0.55) saturate(0.55);
  opacity: 0.88;
}

/* 底部独立安全区：脚注与坐标互斥，不再与 readout 重叠 */
@keyframes ignite-in {
  0% {
    opacity: 0;
    transform: translateY(20px) scale(0.92);
    filter: blur(8px);
  }
  65% {
    opacity: 1;
    transform: translateY(-3px) scale(1.02);
    filter: blur(0);
  }
  100% {
    opacity: 1;
    transform: none;
    filter: blur(0);
  }
}

@keyframes pulse-dot {
  0% {
    box-shadow: 0 0 0 0 rgba(var(--flame-rgb), 0.4);
  }
  70% {
    box-shadow: 0 0 0 14px rgba(var(--flame-rgb), 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(var(--flame-rgb), 0);
  }
}

/* 平板及以下 / 窄桌面：顶栏刊号直接隐藏，避免与操作区重叠 */
@media (max-width: 480px) {
  .app {
    padding-left: calc(14px + var(--safe-left));
    padding-right: calc(14px + var(--safe-right));
  }

  /* 移动端语言按钮只保留 EN/中，省宽度 */
  .ignite {
    padding: 13px 24px;
    letter-spacing: 0.22em;
  }

  .scene-wrap {
    max-height: min(44vh, 340px);
  }

}

@media (min-width: 960px) {
  .app {
    padding-left: calc(28px + var(--safe-left));
    padding-right: calc(28px + var(--safe-right));
  }

  .scene-wrap {
    max-height: min(54vh, 460px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .app,
  .scene-wrap,
  .place,
  .readout,
  .readout.reveal,
  .readout.reveal .num,
  .readout.reveal .overline,
  .readout.reveal .unit,
  .readout.reveal .mode-line,
  .readout.reveal .hairline,
  .readout.reveal .meta,
  .readout.reveal .submeta,
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

  .readout.show,
  .readout.reveal {
    opacity: 1;
    transform: none;
    filter: none;
  }

  .readout.reveal .num {
    filter: none;
    transform: none;
    opacity: 1;
  }
}
</style>
