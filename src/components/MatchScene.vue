<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { prefersReducedMotion, sleep } from '../utils/animate'
import {
  BONFIRE_LOGS,
  CLUSTER_LAYOUT,
  SCENE_LIMITS,
  bonfireLogCount as resolveBonfireLogCount,
  clusterSlot,
  displayFireMode,
  targetMatchCount,
} from '../utils/fireMode'

const props = defineProps({
  /** idle | striking | lit | failed */
  phase: { type: String, default: 'idle' },
  matchCount: { type: Number, default: 0 },
  intensity: { type: Number, default: 0.3 },
  /** 显式极净（优先于 intensity 阈值） */
  clean: { type: Boolean, default: false },
  /** 浓度超过国标封顶：UI 可标爆表 */
  offScale: { type: Boolean, default: false },
  /** match | cluster | bonfire */
  mode: { type: String, default: 'match' },
  grow: { type: Boolean, default: false },
  /** 天气影响：0–1 */
  wind: { type: Number, default: 0 },
  smokeWeight: { type: Number, default: 1 },
  smokeSlow: { type: Number, default: 1 },
})

const grownCount = ref(1)
let growToken = 0

const targetMatches = computed(() => {
  if (props.phase === 'idle' || props.phase === 'striking' || props.phase === 'failed') return 1
  return targetMatchCount(props.mode, props.matchCount)
})

const visibleMatches = computed(() => {
  if (props.phase === 'idle' || props.phase === 'striking' || props.phase === 'failed') return 1
  if (!props.grow) return 1
  return Math.max(1, Math.min(targetMatches.value, grownCount.value))
})

const displayMode = computed(() =>
  displayFireMode(props.mode, visibleMatches.value, props.phase === 'lit'),
)

/** 极净：优先用 prop.clean；否则 intensity 极低时兜底 */
const isClean = computed(() => {
  if (props.phase !== 'lit' && props.phase !== 'striking') return false
  if (props.clean) return true
  return !Number.isFinite(props.intensity) || props.intensity <= 0.02
})

const smokeCount = computed(() => {
  if (props.phase === 'failed') return 3
  if (props.phase !== 'lit') return props.phase === 'striking' ? 1 : 0
  if (isClean.value) return 2
  if (displayMode.value === 'match') return 2
  if (displayMode.value === 'cluster') return 5
  return Math.min(SCENE_LIMITS.maxSmoke, 7 + Math.round(props.intensity * 3))
})

const emberCount = computed(() => {
  if (props.phase === 'failed' || props.phase !== 'lit' || isClean.value) return 0
  if (displayMode.value === 'match') return 3
  if (displayMode.value === 'cluster') return 5
  return Math.min(SCENE_LIMITS.maxEmber, 7 + Math.round(props.intensity * 3))
})

const sceneStyle = computed(() => {
  const clean = isClean.value
  const i = clean ? 0.04 : Math.min(1, Math.max(0.12, props.intensity || 0.2))
  const mode = displayMode.value
  const weight = Math.min(1.4, Math.max(0.7, Number(props.smokeWeight) || 1))
  const slow = Math.min(1.8, Math.max(0.8, Number(props.smokeSlow) || 1))
  const wind = Math.min(1, Math.max(0, Number(props.wind) || 0))
  const baseOpacity = clean
    ? 0.035
    : props.phase === 'failed'
      ? 0.08
      : mode === 'bonfire'
        ? 0.1 + i * 0.3
        : mode === 'cluster'
          ? 0.07 + i * 0.18
          : 0.05 + i * 0.1
  const smokeOpacity = baseOpacity * weight
  const smokeBlur =
    (clean ? 10 : mode === 'bonfire' ? 14 + i * 10 : mode === 'cluster' ? 9 + i * 4 : 8) *
    (0.9 + weight * 0.15)
  const smokeRise = (clean ? 120 : mode === 'bonfire' ? 170 + i * 42 : mode === 'cluster' ? 190 : 200) / slow
  const smokeDrift = (clean ? 6 : mode === 'bonfire' ? 8 + i * 6 : 12) + wind * 18
  return {
    '--intensity': String(props.phase === 'failed' ? 0.15 : i),
    '--flame-scale': String(
      clean
        ? 0.22
        : props.phase === 'failed'
          ? 0.35
          : mode === 'bonfire'
            ? 1.5 + i * 0.5
            : mode === 'cluster'
              ? 1.1 + i * 0.32
              : 1 + i * 0.25,
    ),
    '--smoke-opacity': String(smokeOpacity),
    '--smoke-blur': `${smokeBlur}px`,
    '--smoke-rise': `${smokeRise}px`,
    '--smoke-drift': `${smokeDrift}px`,
    '--wind-skew': `${(wind * 3.5).toFixed(2)}deg`,
    '--smoke-color':
      clean || props.phase === 'failed'
        ? '150, 150, 148'
        : mode === 'bonfire'
          ? '92, 90, 88'
          : mode === 'cluster'
            ? '110, 108, 105'
            : '130, 128, 124',
  }
})

async function runGrowth() {
  const token = ++growToken
  const target = targetMatches.value

  if (!props.grow || props.phase !== 'lit' || props.phase === 'failed') {
    grownCount.value = 1
    return
  }

  if (prefersReducedMotion() || target <= 1) {
    grownCount.value = target
    return
  }

  grownCount.value = 1
  await sleep(320)
  if (token !== growToken) return

  const steps = target - 1
  const stepMs =
    props.mode === 'bonfire'
      ? Math.max(40, Math.min(80, 1100 / steps))
      : Math.max(50, Math.min(100, 900 / steps))

  for (let i = 2; i <= target; i += 1) {
    if (token !== growToken || !props.grow || props.phase !== 'lit') return
    grownCount.value = i
    await sleep(stepMs)
  }
}

watch(
  () => [props.grow, props.phase, props.mode, targetMatches.value],
  () => {
    runGrowth()
  },
  { immediate: true },
)

onUnmounted(() => {
  growToken += 1
})

// 预计算样式，减少模板内计算
const matchStyles = computed(() => {
  const total = visibleMatches.value
  const mode = displayMode.value
  const list = []
  for (let i = 0; i < total; i += 1) {
    if (mode === 'match' || total <= 1) {
      list.push({
        transform: 'translate(0, 0) rotate(0deg) scale(1)',
        zIndex: '20',
        '--delay': '0ms',
      })
      continue
    }
    if (mode === 'cluster') {
      const slot = clusterSlot(i, total)
      const x = slot.nx * CLUSTER_LAYOUT.spread
      const rot = slot.nrot * CLUSTER_LAYOUT.maxRot
      const y = slot.nlift * CLUSTER_LAYOUT.lift
      list.push({
        transform: `translate(${x}px, ${y}px) rotate(${rot}deg) scale(${0.92 + (i % 3) * 0.05})`,
        zIndex: String(10 + i),
        '--delay': `${i * 36}ms`,
      })
      continue
    }
    const ring = Math.floor(i / 6)
    const ringSlot = i % 6
    const angle = (ringSlot / 6) * Math.PI * 2 + ring * 0.35
    const radius = 30 + ring * 24 + (i % 2) * 6
    const x = Math.cos(angle) * radius
    const y = Math.sin(angle) * radius * 0.28 + ring * 12
    const rot = (angle * 180) / Math.PI + 90 + (i % 3) * 8
    const scale = 0.78 + (i % 4) * 0.06
    list.push({
      transform: `translate(${x}px, ${y}px) rotate(${rot}deg) scale(${scale})`,
      zIndex: String(5 + Math.round(24 - y)),
      '--delay': `${i * 24}ms`,
    })
  }
  return list
})

const smokeStyles = computed(() => {
  const mode = displayMode.value
  const spread = mode === 'bonfire' ? 52 : mode === 'cluster' ? 52 : 36
  const baseSize = mode === 'bonfire' ? 40 : mode === 'cluster' ? 34 : 28
  const list = []
  for (let i = 0; i < smokeCount.value; i += 1) {
    const left = 50 + (((i * 47) % spread) - spread / 2)
    const size = baseSize + (i % 4) * (mode === 'bonfire' ? 12 : 10)
    const duration =
      mode === 'bonfire'
        ? 5.4 + (i % 4) * 1.1 + props.intensity * 0.8
        : mode === 'cluster'
          ? 4.2 + (i % 4) * 0.6
          : 3.4 + (i % 3) * 0.5
    list.push({
      left: `${left}%`,
      bottom: `${mode === 'bonfire' ? 24 + (i % 3) * 3 : 28}%`,
      width: `${size}px`,
      height: `${size * (mode === 'bonfire' ? 1.15 : 1.25)}px`,
      animationDuration: `${duration}s`,
      animationDelay: `${(i * 0.38) % 4.2}s`,
    })
  }
  return list
})

const emberStyles = computed(() => {
  const isBonfire = displayMode.value === 'bonfire'
  const spread = isBonfire ? 48 : 22
  const baseLeft = isBonfire ? 26 : 40
  const list = []
  for (let i = 0; i < emberCount.value; i += 1) {
    const size = isBonfire ? 3 + (i % 3) : 4
    list.push({
      left: `${baseLeft + ((i * 31) % spread)}%`,
      width: `${size}px`,
      height: `${size}px`,
      animationDuration: `${(isBonfire ? 1.9 : 1.6) + (i % 4) * 0.35}s`,
      animationDelay: `${(i * 0.22) % 2.4}s`,
      '--ember-x': `${((i * 17) % 28) - 10}px`,
      '--ember-y': `${isBonfire ? 180 + (i % 5) * 22 : 160}px`,
    })
  }
  return list
})

const bonfireLogCount = computed(() => {
  if (displayMode.value !== 'bonfire') return 0
  return resolveBonfireLogCount(visibleMatches.value)
})

const bonfireLogStyles = computed(() => {
  const list = []
  for (let i = 0; i < bonfireLogCount.value; i += 1) {
    const log = BONFIRE_LOGS[i]
    list.push({
      transform: `translate(${log.x}px, ${log.y}px) rotate(${log.rot}deg)`,
      width: `${log.w}px`,
      height: `${log.h}px`,
      '--char': String(log.char),
      zIndex: String(log.z),
      '--delay': `${i * 42}ms`,
    })
  }
  return list
})

const bonfireFlameStyles = computed(() => {
  const i = Math.min(1, Math.max(0.2, props.intensity || 0.3))
  const stage = Math.max(0, visibleMatches.value - 10)
  const scale = 1.05 + i * 0.42 + stage * 0.03
  return {
    '--bonfire-scale': String(scale),
    '--bonfire-heat': String(0.7 + i * 0.35),
  }
})
</script>

<template>
  <div
    class="scene"
    :class="[`mode-${displayMode}`, `phase-${phase}`, { clean: isClean }]"
    :style="sceneStyle"
    aria-hidden="true"
  >
    <div class="floor" />
    <div v-if="phase !== 'idle'" class="glow" />

    <div class="stage">
      <div class="smoke-layer">
        <span
          v-for="(style, i) in smokeStyles"
          :key="`s-${i}`"
          class="smoke"
          :style="style"
        />
      </div>

      <div class="ember-layer">
        <span
          v-for="(style, i) in emberStyles"
          :key="`e-${i}`"
          class="ember"
          :style="style"
        />
      </div>

      <div v-if="phase === 'striking' && !isClean" class="spark-burst">
        <span
          v-for="i in 6"
          :key="`sp-${i}`"
          class="spark"
          :style="{ '--a': `${i * 60}deg` }"
        />
      </div>
      <div v-else-if="phase === 'striking' && isClean" class="spark-burst soft">
        <span
          v-for="i in 3"
          :key="`sp-soft-${i}`"
          class="spark soft"
          :style="{ '--a': `${i * 90 - 30}deg` }"
        />
      </div>

      <div
        v-if="displayMode === 'bonfire'"
        class="bonfire"
        :style="bonfireFlameStyles"
      >
        <div class="bonfire-ash" aria-hidden="true" />
        <div class="bonfire-coals" aria-hidden="true">
          <span class="coal coal-a" />
          <span class="coal coal-b" />
          <span class="coal coal-c" />
        </div>
        <div class="bonfire-logs">
          <div
            v-for="(style, i) in bonfireLogStyles"
            :key="`log-${i}`"
            class="log"
            :class="[BONFIRE_LOGS[i]?.kind === 'base' ? 'log-base' : 'log-teepee', { spawn: i >= 4 }]"
            :style="style"
          >
            <span class="log-end log-end-top" />
            <span class="log-end log-end-bot" />
          </div>
        </div>
        <div
          class="bonfire-flames"
          :class="{ on: phase === 'lit', smolder: phase === 'failed' }"
        >
          <span class="bf-base-glow" />
          <span class="bf-flame bf-flame-back">
            <span class="bf-outer" /><span class="bf-mid" /><span class="bf-core" />
          </span>
          <span class="bf-flame bf-flame-a">
            <span class="bf-outer" /><span class="bf-mid" /><span class="bf-core" /><span class="bf-tip" />
          </span>
          <span class="bf-flame bf-flame-b">
            <span class="bf-outer" /><span class="bf-mid" /><span class="bf-core" />
          </span>
          <span class="bf-flame bf-flame-c">
            <span class="bf-outer" /><span class="bf-mid" /><span class="bf-core" />
          </span>
          <span class="bf-flame bf-flame-d">
            <span class="bf-outer" /><span class="bf-mid" /><span class="bf-core" />
          </span>
          <span class="bf-flame bf-flame-e">
            <span class="bf-outer" /><span class="bf-mid" /><span class="bf-core" />
          </span>
        </div>
      </div>

      <div v-else class="matches" :class="{ striking: phase === 'striking' }">
        <div
          v-for="i in visibleMatches"
          :key="`m-${i}`"
          class="match"
          :class="{ primary: i === 1, spawn: i > 1 }"
          :style="matchStyles[i - 1]"
        >
          <div
            class="flame"
            :class="{
              on:
                (phase === 'lit' && !isClean) ||
                (phase === 'striking' && i === 1 && !isClean) ||
                phase === 'failed',
              smolder: phase === 'failed',
              clean: isClean && (phase === 'lit' || phase === 'striking'),
            }"
          >
            <span class="flame-outer" />
            <span class="flame-mid" />
            <span class="flame-core" />
          </div>
          <div class="head" :class="{ clean: isClean }" />
          <div class="stick" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="./MatchScene.css"></style>
