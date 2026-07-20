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

/** 极净：几乎不燃（intensity≈0）；striking 阶段也生效，避免先旺烧再熄 */
const isClean = computed(
  () =>
    (props.phase === 'lit' || props.phase === 'striking') &&
    (!Number.isFinite(props.intensity) || props.intensity <= 0.02),
)

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

<style scoped>
.scene {
  position: relative;
  width: min(760px, 100%);
  max-width: 100%;
  height: min(62vh, 560px);
  margin: 0 auto;
  display: grid;
  place-items: center;
  overflow: visible;
  contain: layout;
}

.floor {
  position: absolute;
  left: 50%;
  bottom: 10%;
  width: 46%;
  height: 28px;
  transform: translateX(-50%);
  border-radius: 50%;
  background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0.07), transparent 72%);
  filter: blur(3px);
  transition: width 1.1s cubic-bezier(0.22, 1, 0.36, 1);
}

.mode-cluster .floor {
  width: 64%;
}

.mode-bonfire .floor {
  width: 88%;
  height: 42px;
  background: radial-gradient(
    ellipse at center,
    rgba(255, 120, 36, 0.18),
    rgba(180, 60, 12, 0.08) 36%,
    rgba(0, 0, 0, 0.05) 58%,
    transparent 78%
  );
}

.glow {
  position: absolute;
  left: 50%;
  bottom: 16%;
  width: 62%;
  height: 48%;
  transform: translateX(-50%);
  border-radius: 50%;
  background: radial-gradient(
    ellipse at center,
    rgba(255, 140, 60, calc(0.18 * var(--intensity))),
    transparent 70%
  );
  filter: blur(22px);
  pointer-events: none;
  animation: glow-pulse 4.8s ease-in-out infinite;
}

.mode-bonfire .glow {
  width: 78%;
  height: 58%;
  bottom: 12%;
  background: radial-gradient(
    ellipse at 50% 78%,
    rgba(255, 148, 52, calc(0.28 * var(--intensity))),
    rgba(255, 88, 20, calc(0.12 * var(--intensity))) 42%,
    transparent 72%
  );
  filter: blur(28px);
}

.stage {
  position: relative;
  width: 100%;
  height: 100%;
}

.matches {
  position: absolute;
  left: 50%;
  bottom: 16%;
  width: 0;
  height: 0;
  transform: translate(-50%, 0) skewX(var(--wind-skew, 0deg));
  transform-origin: 50% 100%;
  transition: transform 1.2s ease;
}

.phase-failed .matches {
  filter: grayscale(0.35) saturate(0.7);
}

.matches.striking .match.primary {
  animation: strike-swipe 0.75s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.match {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 36px;
  height: 260px;
  margin-left: -18px;
  transform-origin: 50% 100%;
  transition: transform 1.05s cubic-bezier(0.22, 1, 0.36, 1);
  contain: layout style;
}

.match.spawn {
  animation: match-spawn 0.5s cubic-bezier(0.2, 1.1, 0.3, 1) both;
  animation-delay: var(--delay, 0ms);
}

.stick {
  position: absolute;
  left: 50%;
  bottom: 0;
  width: 12px;
  height: 188px;
  margin-left: -6px;
  border-radius: 5px;
  background: linear-gradient(180deg, #e8cda8 0%, var(--wood) 42%, var(--wood-deep) 100%);
}

.head {
  position: absolute;
  left: 50%;
  bottom: 178px;
  width: 20px;
  height: 23px;
  margin-left: -10px;
  border-radius: 50% 50% 46% 46%;
  background: radial-gradient(circle at 35% 30%, #4a3224, var(--head) 72%);
}

.flame {
  position: absolute;
  left: 50%;
  bottom: 190px;
  width: 48px;
  height: 78px;
  margin-left: -24px;
  transform: scale(0);
  transform-origin: 50% 100%;
  opacity: 0;
  filter: drop-shadow(0 0 14px rgba(255, 106, 26, 0.34));
}

.flame.on {
  opacity: 1;
  animation:
    flame-on 0.55s cubic-bezier(0.2, 1.15, 0.3, 1) forwards,
    flame-breathe 4.6s ease-in-out 0.55s infinite;
}

.flame.smolder {
  opacity: 0.55;
  filter: grayscale(0.4) brightness(0.85);
  animation: flame-smolder 3.2s ease-in-out infinite !important;
}

/* 极净空气：药头一点余温，几乎无焰 */
.flame.clean {
  opacity: 1;
  width: 28px;
  height: 22px;
  margin-left: -14px;
  bottom: 188px;
  filter: none;
  transform: scale(1);
  animation: clean-ember 3.6s ease-in-out infinite !important;
}

.flame.clean .flame-outer {
  width: 16px;
  height: 14px;
  bottom: 0;
  background: radial-gradient(
    ellipse at 50% 70%,
    rgba(255, 140, 70, 0.55),
    rgba(255, 90, 30, 0.12) 62%,
    transparent 78%
  );
  animation: none;
  filter: blur(0.6px);
}

.flame.clean .flame-mid {
  width: 9px;
  height: 8px;
  background: radial-gradient(ellipse at 50% 70%, rgba(255, 200, 120, 0.7), transparent 78%);
  animation: none;
}

.flame.clean .flame-core {
  width: 4px;
  height: 4px;
  bottom: 1px;
  background: radial-gradient(circle, rgba(255, 240, 200, 0.85), transparent 72%);
  animation: none;
}

.head.clean {
  background: radial-gradient(circle at 35% 30%, #5a4030, #2a1c14 68%, #1a100c 100%);
  box-shadow: 0 0 10px rgba(255, 120, 40, 0.18);
}

.scene.clean .glow {
  opacity: 0.25;
  filter: blur(18px) grayscale(0.35);
}

.scene.clean .floor {
  opacity: 0.55;
}

.phase-striking .match.primary .flame.on {
  animation: flame-ignite 0.58s cubic-bezier(0.2, 1.3, 0.3, 1) forwards;
}

.flame-outer,
.flame-mid,
.flame-core {
  position: absolute;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  border-radius: 50% 50% 50% 50% / 62% 62% 38% 38%;
}

.flame-outer {
  width: 42px;
  height: 74px;
  background: radial-gradient(
    ellipse at 50% 72%,
    rgba(255, 132, 40, 0.96),
    rgba(255, 70, 16, 0.12) 72%,
    transparent 78%
  );
  animation: flame-wiggle 1.1s ease-in-out infinite;
}

.flame-mid {
  width: 26px;
  height: 54px;
  background: radial-gradient(ellipse at 50% 78%, #ffd27a, #ff7a28 68%, transparent 82%);
  animation: flame-wiggle 0.95s ease-in-out infinite reverse;
}

.flame-core {
  width: 12px;
  height: 28px;
  bottom: 3px;
  background: radial-gradient(ellipse at 50% 80%, #fff8e8, #ffe08a 62%, transparent 82%);
  animation: flame-wiggle 0.8s ease-in-out infinite;
}

.mode-bonfire .match .flame {
  bottom: 156px;
}

/* ── Bonfire (campfire stack) ── */
.bonfire {
  position: absolute;
  left: 50%;
  bottom: 15%;
  width: 0;
  height: 0;
  transform: translate(-50%, 0) skewX(var(--wind-skew, 0deg));
  transform-origin: 50% 100%;
  transition: transform 1.2s ease;
}

.bonfire-ash {
  position: absolute;
  left: 50%;
  bottom: -6px;
  width: 118px;
  height: 18px;
  margin-left: -59px;
  border-radius: 50%;
  background: radial-gradient(
    ellipse at center,
    rgba(48, 32, 22, 0.28),
    rgba(90, 70, 52, 0.12) 48%,
    transparent 78%
  );
  filter: blur(2px);
  z-index: 5;
}

.bonfire-coals {
  position: absolute;
  left: 50%;
  bottom: -1px;
  width: 96px;
  height: 28px;
  margin-left: -48px;
  z-index: 12;
  pointer-events: none;
}

.coal {
  position: absolute;
  border-radius: 50%;
  filter: blur(0.4px);
  animation: coals-pulse 2.8s ease-in-out infinite;
}

.coal-a {
  left: 50%;
  bottom: 0;
  width: 78px;
  height: 20px;
  margin-left: -39px;
  background: radial-gradient(
    ellipse at 50% 55%,
    rgba(255, 168, 64, 0.95),
    rgba(255, 92, 24, 0.72) 38%,
    rgba(140, 36, 8, 0.42) 68%,
    transparent 100%
  );
  box-shadow: 0 0 18px rgba(255, 110, 28, 0.45);
}

.coal-b {
  left: 28%;
  bottom: 4px;
  width: 28px;
  height: 14px;
  background: radial-gradient(ellipse at center, rgba(255, 120, 36, 0.85), transparent 78%);
  animation-delay: 0.4s;
  animation-duration: 2.4s;
}

.coal-c {
  left: 58%;
  bottom: 3px;
  width: 24px;
  height: 12px;
  background: radial-gradient(ellipse at center, rgba(255, 150, 48, 0.8), transparent 78%);
  animation-delay: 0.9s;
  animation-duration: 3.1s;
}

.bonfire-logs {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 0;
  height: 0;
  z-index: 10;
}

.log {
  position: absolute;
  left: 50%;
  bottom: 0;
  margin-left: 0;
  transform-origin: 50% 100%;
  border-radius: 7px;
  background:
    linear-gradient(
      90deg,
      transparent 0%,
      rgba(0, 0, 0, 0.12) 18%,
      transparent 36%,
      rgba(0, 0, 0, 0.1) 58%,
      transparent 78%,
      rgba(0, 0, 0, 0.14) 100%
    ),
    linear-gradient(
      90deg,
      #5a3820 0%,
      #8b6240 16%,
      #c4a07a 36%,
      #d8bc98 50%,
      #c4a07a 64%,
      #8b6240 84%,
      #5a3820 100%
    );
  box-shadow:
    inset 0 -4px 8px rgba(0, 0, 0, 0.22),
    inset 0 2px 4px rgba(255, 255, 255, 0.1),
    0 2px 6px rgba(40, 18, 6, 0.18);
  transition: transform 1.05s cubic-bezier(0.22, 1, 0.36, 1);
}

.log-end {
  position: absolute;
  left: 50%;
  width: 100%;
  height: 9px;
  margin-left: -50%;
  border-radius: 50%;
  pointer-events: none;
  background: radial-gradient(
    ellipse at 50% 50%,
    #d2b090 0%,
    #a07850 42%,
    #5a3820 78%,
    #3a2414 100%
  );
  box-shadow: inset 0 0 4px rgba(0, 0, 0, 0.25);
}

.log-end-top {
  top: -4px;
}

.log-end-bot {
  bottom: -4px;
  opacity: 0.9;
}

.log-teepee .log-end-bot {
  display: none;
}

.log::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
}

.log-teepee::before {
  background: linear-gradient(
    180deg,
    transparent 0%,
    rgba(52, 26, 12, calc(var(--char, 0.5) * 0.35)) 28%,
    rgba(28, 12, 6, calc(var(--char, 0.5) * 0.72)) 72%,
    rgba(12, 4, 2, calc(var(--char, 0.5) * 0.92)) 100%
  );
}

.log-base::before {
  background:
    radial-gradient(
      ellipse 70% 140% at 50% 40%,
      rgba(255, 110, 36, calc(var(--char, 0.5) * 0.42)),
      rgba(90, 28, 8, calc(var(--char, 0.5) * 0.55)) 52%,
      rgba(28, 12, 6, calc(var(--char, 0.5) * 0.78)) 82%,
      transparent 100%
    );
}

.log::after {
  content: '';
  position: absolute;
  left: 18%;
  top: 12%;
  width: 64%;
  height: 22%;
  border-radius: 40%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.1) 40%,
    transparent
  );
  pointer-events: none;
}

.log.spawn {
  animation: log-spawn 0.55s cubic-bezier(0.2, 1.1, 0.3, 1) both;
  animation-delay: var(--delay, 0ms);
}

.bonfire-flames {
  position: absolute;
  left: 50%;
  bottom: 18px;
  width: 0;
  height: 0;
  z-index: 20;
  filter: drop-shadow(0 0 26px rgba(255, 112, 28, 0.5));
}

.bonfire-flames.on {
  animation: bonfire-breathe 3.8s ease-in-out infinite;
}

.bonfire-flames.smolder {
  opacity: 0.5;
  filter: grayscale(0.35) brightness(0.82) drop-shadow(0 0 8px rgba(120, 100, 90, 0.3));
  animation: bonfire-smolder 3.4s ease-in-out infinite;
}

.bf-base-glow {
  position: absolute;
  left: 50%;
  bottom: -4px;
  width: 86px;
  height: 36px;
  margin-left: -43px;
  border-radius: 50%;
  background: radial-gradient(
    ellipse at 50% 60%,
    rgba(255, 190, 90, calc(0.85 * var(--bonfire-heat, 1))),
    rgba(255, 100, 24, calc(0.45 * var(--bonfire-heat, 1))) 48%,
    transparent 78%
  );
  filter: blur(6px);
  z-index: 1;
  animation: coals-pulse 2.6s ease-in-out infinite;
}

.bf-flame {
  position: absolute;
  left: 0;
  bottom: 0;
  transform: translateX(-50%) scale(var(--bonfire-scale, 1));
  transform-origin: 50% 100%;
}

.bf-flame-back {
  width: 92px;
  height: 108px;
  margin-left: 0;
  z-index: 1;
  opacity: 0.55;
  filter: blur(3px);
}

.bf-flame-a {
  width: 78px;
  height: 132px;
  margin-left: 0;
  z-index: 5;
}

.bf-flame-b {
  width: 54px;
  height: 98px;
  margin-left: -34px;
  z-index: 4;
  opacity: 0.92;
}

.bf-flame-c {
  width: 50px;
  height: 92px;
  margin-left: 32px;
  z-index: 4;
  opacity: 0.9;
}

.bf-flame-d {
  width: 36px;
  height: 72px;
  margin-left: -18px;
  z-index: 3;
  opacity: 0.78;
}

.bf-flame-e {
  width: 34px;
  height: 68px;
  margin-left: 16px;
  z-index: 3;
  opacity: 0.76;
}

.bf-outer,
.bf-mid,
.bf-core,
.bf-tip {
  position: absolute;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  border-radius: 50% 50% 48% 48% / 68% 68% 32% 32%;
}

.bf-flame-a .bf-outer {
  width: 74px;
  height: 126px;
  background: radial-gradient(
    ellipse at 50% 78%,
    rgba(255, 124, 28, 0.98) 0%,
    rgba(255, 72, 12, 0.55) 42%,
    rgba(255, 48, 8, 0.12) 72%,
    transparent 82%
  );
  animation: flame-wiggle 1.05s ease-in-out infinite;
}

.bf-flame-a .bf-mid {
  width: 46px;
  height: 96px;
  background: radial-gradient(
    ellipse at 50% 80%,
    #ffe08a 0%,
    #ffb24a 32%,
    #ff7420 68%,
    transparent 86%
  );
  animation: flame-wiggle 0.9s ease-in-out infinite reverse;
}

.bf-flame-a .bf-core {
  width: 22px;
  height: 52px;
  bottom: 5px;
  background: radial-gradient(ellipse at 50% 82%, #fffdf4, #ffe9a8 48%, #ffd070 72%, transparent 88%);
  animation: flame-wiggle 0.75s ease-in-out infinite;
  filter: blur(0.2px);
}

.bf-flame-a .bf-tip {
  width: 10px;
  height: 28px;
  bottom: 78px;
  background: radial-gradient(ellipse at 50% 100%, rgba(255, 210, 120, 0.85), transparent 78%);
  border-radius: 50% 50% 45% 45% / 70% 70% 30% 30%;
  animation: flame-tip 0.7s ease-in-out infinite;
  filter: blur(0.6px);
}

.bf-flame-back .bf-outer {
  width: 100%;
  height: 100%;
  background: radial-gradient(
    ellipse at 50% 80%,
    rgba(255, 96, 20, 0.7),
    rgba(255, 48, 8, 0.18) 58%,
    transparent 80%
  );
  animation: flame-wiggle 1.4s ease-in-out infinite reverse;
}

.bf-flame-back .bf-mid {
  width: 58%;
  height: 70%;
  background: radial-gradient(ellipse at 50% 80%, rgba(255, 150, 50, 0.55), transparent 80%);
  animation: flame-wiggle 1.2s ease-in-out infinite;
}

.bf-flame-back .bf-core {
  width: 24%;
  height: 34%;
  bottom: 4px;
  background: radial-gradient(ellipse at 50% 80%, rgba(255, 220, 140, 0.45), transparent 80%);
}

.bf-flame-b .bf-outer,
.bf-flame-c .bf-outer,
.bf-flame-d .bf-outer,
.bf-flame-e .bf-outer {
  width: 100%;
  height: 100%;
  background: radial-gradient(
    ellipse at 50% 76%,
    rgba(255, 118, 28, 0.94),
    rgba(255, 58, 10, 0.22) 58%,
    transparent 80%
  );
  animation: flame-wiggle 1.18s ease-in-out infinite;
}

.bf-flame-b .bf-mid,
.bf-flame-c .bf-mid,
.bf-flame-d .bf-mid,
.bf-flame-e .bf-mid {
  width: 60%;
  height: 74%;
  background: radial-gradient(ellipse at 50% 80%, #ffd070, #ff7a24 66%, transparent 86%);
  animation: flame-wiggle 1s ease-in-out infinite reverse;
}

.bf-flame-b .bf-core,
.bf-flame-c .bf-core,
.bf-flame-d .bf-core,
.bf-flame-e .bf-core {
  width: 28%;
  height: 38%;
  bottom: 3px;
  background: radial-gradient(ellipse at 50% 82%, #fff8e0, #ffd878 60%, transparent 86%);
  animation: flame-wiggle 0.84s ease-in-out infinite;
}

.bf-flame-b {
  animation: bf-flame-drift-a 2.6s ease-in-out infinite;
}

.bf-flame-c {
  animation: bf-flame-drift-b 2.9s ease-in-out infinite;
}

.bf-flame-d {
  animation: bf-flame-drift-c 2.2s ease-in-out infinite;
}

.bf-flame-e {
  animation: bf-flame-drift-d 2.45s ease-in-out infinite;
}

@keyframes log-spawn {
  0% {
    opacity: 0;
    filter: brightness(0.7);
  }
  100% {
    opacity: 1;
    filter: brightness(1);
  }
}

@keyframes coals-pulse {
  0%,
  100% {
    opacity: 0.78;
    transform: scale(1);
  }
  40% {
    opacity: 1;
    transform: scale(1.05);
  }
  70% {
    opacity: 0.9;
    transform: scale(1.02);
  }
}

@keyframes bonfire-breathe {
  0%,
  100% {
    transform: scale(1) translateY(0);
  }
  35% {
    transform: scale(1.05) translateY(-4px);
  }
  70% {
    transform: scale(1.02) translateY(-1px);
  }
}

@keyframes bonfire-smolder {
  0%,
  100% {
    transform: scale(0.7) translateY(3px);
    opacity: 0.36;
  }
  50% {
    transform: scale(0.78) translateY(0);
    opacity: 0.5;
  }
}

@keyframes flame-tip {
  0%,
  100% {
    transform: translateX(-50%) scaleY(1) scaleX(1);
    opacity: 0.85;
  }
  50% {
    transform: translateX(-50%) scaleY(1.18) scaleX(0.78);
    opacity: 0.55;
  }
}

@keyframes bf-flame-drift-a {
  0%,
  100% {
    transform: translateX(-50%) scale(var(--bonfire-scale, 1)) rotate(-3deg);
  }
  50% {
    transform: translateX(calc(-50% - 4px)) scale(calc(var(--bonfire-scale, 1) * 1.06)) rotate(3deg);
  }
}

@keyframes bf-flame-drift-b {
  0%,
  100% {
    transform: translateX(-50%) scale(var(--bonfire-scale, 1)) rotate(3deg);
  }
  50% {
    transform: translateX(calc(-50% + 4px)) scale(calc(var(--bonfire-scale, 1) * 1.05)) rotate(-2deg);
  }
}

@keyframes bf-flame-drift-c {
  0%,
  100% {
    transform: translateX(-50%) scale(calc(var(--bonfire-scale, 1) * 0.92)) rotate(-4deg);
  }
  50% {
    transform: translateX(calc(-50% - 5px)) scale(calc(var(--bonfire-scale, 1) * 1.0)) rotate(2deg);
  }
}

@keyframes bf-flame-drift-d {
  0%,
  100% {
    transform: translateX(-50%) scale(calc(var(--bonfire-scale, 1) * 0.9)) rotate(4deg);
  }
  50% {
    transform: translateX(calc(-50% + 5px)) scale(calc(var(--bonfire-scale, 1) * 0.98)) rotate(-3deg);
  }
}

.smoke-layer,
.ember-layer {
  position: absolute;
  inset: -6% -4% 14% -4%;
  pointer-events: none;
  overflow: hidden;
  contain: paint;
  -webkit-mask-image: radial-gradient(
    ellipse 62% 78% at 50% 72%,
    #000 0%,
    #000 46%,
    rgba(0, 0, 0, 0.55) 68%,
    transparent 86%
  );
  mask-image: radial-gradient(
    ellipse 62% 78% at 50% 72%,
    #000 0%,
    #000 46%,
    rgba(0, 0, 0, 0.55) 68%,
    transparent 86%
  );
}

.smoke {
  position: absolute;
  bottom: 28%;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(var(--smoke-color, 120, 120, 120), var(--smoke-opacity)),
    transparent 72%
  );
  filter: blur(var(--smoke-blur, 10px));
  opacity: 0;
  animation-name: smoke-rise;
  animation-timing-function: cubic-bezier(0.22, 0.15, 0.25, 1);
  animation-iteration-count: infinite;
}

.mode-bonfire .smoke,
.mode-cluster .smoke {
  mix-blend-mode: normal;
}

.mode-bonfire .smoke {
  border-radius: 48% 52% 50% 50%;
}

.ember {
  position: absolute;
  bottom: 34%;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #ff9a4a;
  box-shadow: 0 0 8px rgba(255, 106, 26, 0.65);
  opacity: 0;
  animation-name: ember-fly;
  animation-timing-function: ease-out;
  animation-iteration-count: infinite;
}

.mode-bonfire .ember {
  bottom: 30%;
  background: radial-gradient(circle, #ffe0a0 0%, #ff8a30 55%, #ff4a10 100%);
  box-shadow:
    0 0 10px rgba(255, 120, 30, 0.8),
    0 0 2px rgba(255, 220, 140, 0.9);
}

.spark-burst {
  position: absolute;
  left: 50%;
  bottom: 52%;
  width: 0;
  height: 0;
  z-index: 30;
}

.spark {
  position: absolute;
  left: 0;
  top: 0;
  width: 5px;
  height: 5px;
  margin: -2.5px;
  border-radius: 50%;
  background: #ffb15a;
  box-shadow: 0 0 10px #ff6a1a;
  animation: spark-out 0.65s ease-out forwards;
  transform: rotate(var(--a)) translateY(0);
}

.spark-burst.soft {
  bottom: 54%;
}

.spark.soft {
  width: 3px;
  height: 3px;
  margin: -1.5px;
  background: #d8c4a8;
  box-shadow: 0 0 6px rgba(180, 140, 100, 0.35);
  animation: spark-out-soft 0.45s ease-out forwards;
}

@keyframes spark-out-soft {
  0% {
    transform: rotate(var(--a)) translateY(0) scale(1);
    opacity: 0.7;
  }
  100% {
    transform: rotate(var(--a)) translateY(-22px) scale(0);
    opacity: 0;
  }
}

@keyframes match-spawn {
  0% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}

@keyframes strike-swipe {
  0% {
    transform: translate(-42px, 26px) rotate(-28deg) scale(1);
  }
  55% {
    transform: translate(14px, -8px) rotate(8deg) scale(1);
  }
  100% {
    transform: translate(0, 0) rotate(0deg) scale(1);
  }
}

@keyframes flame-ignite {
  0% {
    transform: scale(0) translateY(10px);
    opacity: 0;
  }
  60% {
    transform: scale(calc(var(--flame-scale) * 1.12));
    opacity: 1;
  }
  100% {
    transform: scale(var(--flame-scale));
    opacity: 1;
  }
}

@keyframes flame-on {
  0% {
    transform: scale(0);
  }
  100% {
    transform: scale(var(--flame-scale));
  }
}

@keyframes flame-breathe {
  0%,
  100% {
    transform: scale(var(--flame-scale)) translateY(0) rotate(-1deg);
  }
  50% {
    transform: scale(calc(var(--flame-scale) * 1.045)) translateY(-2px) rotate(1deg);
  }
}

@keyframes flame-smolder {
  0%,
  100% {
    transform: scale(0.32) translateY(2px);
    opacity: 0.35;
  }
  50% {
    transform: scale(0.4) translateY(0);
    opacity: 0.55;
  }
}

@keyframes clean-ember {
  0%,
  100% {
    opacity: 0.55;
    transform: scale(0.92);
  }
  50% {
    opacity: 0.85;
    transform: scale(1.05);
  }
}

@keyframes flame-wiggle {
  0%,
  100% {
    transform: translateX(-50%) scaleX(1) scaleY(1);
  }
  50% {
    transform: translateX(-50%) scaleX(0.92) scaleY(1.05);
  }
}

@keyframes smoke-rise {
  0% {
    transform: translate3d(0, 14px, 0) scale(0.5);
    opacity: 0;
  }
  18% {
    opacity: 0.72;
  }
  100% {
    transform: translate3d(var(--smoke-drift, 12px), calc(var(--smoke-rise, 200px) * -1), 0)
      scale(1.55);
    opacity: 0;
  }
}

@keyframes ember-fly {
  0% {
    transform: translate3d(0, 0, 0) scale(1);
    opacity: 0;
  }
  12% {
    opacity: 1;
  }
  100% {
    transform: translate3d(var(--ember-x, 16px), calc(var(--ember-y, 160px) * -1), 0) scale(0.2);
    opacity: 0;
  }
}

@keyframes spark-out {
  0% {
    transform: rotate(var(--a)) translateY(0) scale(1);
    opacity: 1;
  }
  100% {
    transform: rotate(var(--a)) translateY(-52px) scale(0);
    opacity: 0;
  }
}

@keyframes glow-pulse {
  0%,
  100% {
    opacity: 0.7;
    transform: translateX(-50%) scale(1);
  }
  50% {
    opacity: 1;
    transform: translateX(-50%) scale(1.04);
  }
}

.phase-idle .flame,
.phase-idle .smoke,
.phase-idle .ember {
  display: none;
}

.phase-idle .match.primary {
  animation: idle-float 5.5s ease-in-out infinite;
}

@keyframes idle-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-3px);
  }
}

@media (max-width: 640px) {
  .scene {
    width: 100%;
    height: min(52vh, 420px);
  }

  .match {
    width: 30px;
    height: 210px;
    margin-left: -15px;
  }

  .stick {
    width: 10px;
    height: 152px;
    margin-left: -5px;
  }

  .head {
    bottom: 144px;
    width: 17px;
    height: 19px;
    margin-left: -8.5px;
  }

  .flame {
    bottom: 154px;
    width: 40px;
    height: 64px;
    margin-left: -20px;
  }

  .flame-outer {
    width: 34px;
    height: 60px;
  }

  .flame-mid {
    width: 20px;
    height: 44px;
  }

  .flame-core {
    width: 10px;
    height: 22px;
  }

  .bf-flame-a {
    width: 62px;
    height: 108px;
  }

  .bf-flame-a .bf-outer {
    width: 58px;
    height: 102px;
  }

  .bf-flame-a .bf-mid {
    width: 36px;
    height: 76px;
  }

  .bf-flame-a .bf-core {
    width: 16px;
    height: 40px;
  }

  .bf-flame-a .bf-tip {
    bottom: 64px;
    height: 22px;
  }

  .bf-flame-back {
    width: 74px;
    height: 88px;
  }

  .bf-flame-b {
    width: 42px;
    height: 78px;
    margin-left: -26px;
  }

  .bf-flame-c {
    width: 40px;
    height: 74px;
    margin-left: 24px;
  }

  .bf-flame-d {
    width: 28px;
    height: 56px;
    margin-left: -14px;
  }

  .bf-flame-e {
    width: 26px;
    height: 52px;
    margin-left: 12px;
  }

  .bonfire-coals {
    width: 78px;
    height: 22px;
    margin-left: -39px;
  }

  .coal-a {
    width: 64px;
    height: 16px;
    margin-left: -32px;
  }

  .bonfire-ash {
    width: 96px;
    margin-left: -48px;
  }

  .bf-base-glow {
    width: 70px;
    height: 28px;
    margin-left: -35px;
  }
}

@media (min-width: 960px) {
  .scene {
    width: min(860px, 72vw);
    height: min(64vh, 600px);
  }
}

@media (min-height: 900px) {
  .scene {
    height: min(66vh, 640px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .match.spawn,
  .log.spawn,
  .phase-idle .match.primary,
  .flame.on,
  .flame.clean,
  .flame-outer,
  .flame-mid,
  .flame-core,
  .bf-flame,
  .bf-outer,
  .bf-mid,
  .bf-core,
  .bf-tip,
  .bf-base-glow,
  .bonfire-flames.on,
  .bonfire-coals,
  .coal,
  .smoke,
  .ember,
  .glow {
    animation: none !important;
  }

  .flame.on {
    opacity: 1;
    transform: scale(var(--flame-scale));
  }

  .flame.clean {
    opacity: 0.7;
    transform: scale(1);
  }
}
</style>
