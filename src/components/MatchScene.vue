<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { prefersReducedMotion, sleep } from '../utils/animate'

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

// 硬上限，防止极端数据撑爆 DOM
const MAX_MATCH = 18
const MAX_SMOKE = 10
const MAX_EMBER = 8

const targetMatches = computed(() => {
  if (props.phase === 'idle' || props.phase === 'striking' || props.phase === 'failed') return 1
  const n = Math.max(0, Number(props.matchCount) || 0)
  if (props.mode === 'match') return 1
  if (props.mode === 'cluster') return Math.min(7, Math.max(3, Math.ceil(n)))
  return Math.min(MAX_MATCH, Math.max(10, Math.ceil(n * 0.75)))
})

const visibleMatches = computed(() => {
  if (props.phase === 'idle' || props.phase === 'striking' || props.phase === 'failed') return 1
  if (!props.grow) return 1
  return Math.max(1, Math.min(targetMatches.value, grownCount.value))
})

const displayMode = computed(() => {
  if (props.phase !== 'lit') return 'match'
  const n = visibleMatches.value
  if (props.mode === 'bonfire' && n >= 10) return 'bonfire'
  if ((props.mode === 'cluster' || props.mode === 'bonfire') && n >= 3) return 'cluster'
  return 'match'
})

const smokeCount = computed(() => {
  if (props.phase === 'failed') return 3
  if (props.phase !== 'lit') return props.phase === 'striking' ? 1 : 0
  if (displayMode.value === 'match') return 2
  if (displayMode.value === 'cluster') return 5
  return Math.min(MAX_SMOKE, 7 + Math.round(props.intensity * 3))
})

const emberCount = computed(() => {
  if (props.phase === 'failed' || props.phase !== 'lit') return 0
  if (displayMode.value === 'match') return 3
  if (displayMode.value === 'cluster') return 5
  return Math.min(MAX_EMBER, 5 + Math.round(props.intensity * 2))
})

const sceneStyle = computed(() => {
  const i = Math.min(1, Math.max(0.12, props.intensity || 0.2))
  const mode = displayMode.value
  const weight = Math.min(1.4, Math.max(0.7, Number(props.smokeWeight) || 1))
  const slow = Math.min(1.8, Math.max(0.8, Number(props.smokeSlow) || 1))
  const wind = Math.min(1, Math.max(0, Number(props.wind) || 0))
  const baseOpacity =
    props.phase === 'failed'
      ? 0.08
      : mode === 'bonfire'
        ? 0.1 + i * 0.3
        : mode === 'cluster'
          ? 0.07 + i * 0.18
          : 0.05 + i * 0.1
  const smokeOpacity = baseOpacity * weight
  const smokeBlur = (mode === 'bonfire' ? 12 + i * 8 : mode === 'cluster' ? 9 + i * 4 : 8) * (0.9 + weight * 0.15)
  const smokeRise = (mode === 'bonfire' ? 150 + i * 36 : mode === 'cluster' ? 190 : 200) / slow
  const smokeDrift = (mode === 'bonfire' ? 6 + i * 4 : 12) + wind * 18
  return {
    '--intensity': String(props.phase === 'failed' ? 0.15 : i),
    '--flame-scale': String(
      props.phase === 'failed'
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
      props.phase === 'failed'
        ? '140, 140, 140'
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
      const t = total <= 1 ? 0.5 : i / (total - 1)
      const x = (t - 0.5) * 92
      const rot = (t - 0.5) * 38
      const y = Math.abs(t - 0.5) * 14
      list.push({
        transform: `translate(${x}px, ${y}px) rotate(${rot}deg) scale(${0.92 + (i % 3) * 0.05})`,
        zIndex: String(10 + i),
        '--delay': `${i * 36}ms`,
      })
      continue
    }
    const ring = Math.floor(i / 6)
    const slot = i % 6
    const angle = (slot / 6) * Math.PI * 2 + ring * 0.35
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
  const spread = mode === 'bonfire' ? 80 : mode === 'cluster' ? 52 : 36
  const baseSize = mode === 'bonfire' ? 44 : mode === 'cluster' ? 34 : 28
  const list = []
  for (let i = 0; i < smokeCount.value; i += 1) {
    const left = 50 + (((i * 47) % spread) - spread / 2)
    const size = baseSize + (i % 4) * (mode === 'bonfire' ? 14 : 10)
    const duration =
      mode === 'bonfire'
        ? 6 + (i % 4) * 1 + props.intensity
        : mode === 'cluster'
          ? 4.2 + (i % 4) * 0.6
          : 3.4 + (i % 3) * 0.5
    list.push({
      left: `${left}%`,
      bottom: `${mode === 'bonfire' ? 24 + (i % 3) * 3 : 28}%`,
      width: `${size}px`,
      height: `${size * (mode === 'bonfire' ? 1.12 : 1.25)}px`,
      animationDuration: `${duration}s`,
      animationDelay: `${(i * 0.4) % 4}s`,
    })
  }
  return list
})

const emberStyles = computed(() => {
  const list = []
  for (let i = 0; i < emberCount.value; i += 1) {
    list.push({
      left: `${40 + ((i * 31) % 22)}%`,
      animationDuration: `${1.6 + (i % 4) * 0.3}s`,
      animationDelay: `${(i * 0.22) % 2}s`,
    })
  }
  return list
})
</script>

<template>
  <div
    class="scene"
    :class="[`mode-${displayMode}`, `phase-${phase}`]"
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

      <div v-if="phase === 'striking'" class="spark-burst">
        <span
          v-for="i in 6"
          :key="`sp-${i}`"
          class="spark"
          :style="{ '--a': `${i * 60}deg` }"
        />
      </div>

      <div class="matches" :class="{ striking: phase === 'striking' }">
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
              on: phase === 'lit' || (phase === 'striking' && i === 1) || phase === 'failed',
              smolder: phase === 'failed',
            }"
          >
            <span class="flame-outer" />
            <span class="flame-mid" />
            <span class="flame-core" />
          </div>
          <div class="head" />
          <div class="stick" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scene {
  position: relative;
  width: min(760px, 96vw);
  height: min(62vh, 560px);
  margin: 0 auto;
  display: grid;
  place-items: center;
  contain: layout paint;
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
  width: 84%;
  height: 36px;
  background: radial-gradient(
    ellipse at center,
    rgba(255, 106, 26, 0.12),
    rgba(0, 0, 0, 0.05) 48%,
    transparent 74%
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
  width: 90%;
  height: 60%;
  bottom: 12%;
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

.mode-bonfire .match {
  height: 220px;
}

.mode-bonfire .match .stick {
  height: 156px;
}

.mode-bonfire .match .head {
  bottom: 146px;
}

.mode-bonfire .match .flame {
  bottom: 156px;
}

.smoke-layer,
.ember-layer {
  position: absolute;
  inset: 0 0 16% 0;
  pointer-events: none;
  overflow: hidden;
  contain: strict;
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
  mix-blend-mode: multiply;
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
    transform: translate3d(16px, -160px, 0) scale(0.25);
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
    width: min(100vw, 560px);
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

  .mode-bonfire .match {
    height: 180px;
  }

  .mode-bonfire .match .stick {
    height: 128px;
  }

  .mode-bonfire .match .head {
    bottom: 120px;
  }

  .mode-bonfire .match .flame {
    bottom: 128px;
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
  .phase-idle .match.primary,
  .flame.on,
  .flame-outer,
  .flame-mid,
  .flame-core,
  .smoke,
  .ember,
  .glow {
    animation: none !important;
  }

  .flame.on {
    opacity: 1;
    transform: scale(var(--flame-scale));
  }
}
</style>
