<script setup>
import { computed } from 'vue'
import { t } from '../i18n'

const props = defineProps({
  /** boot | ready | leaving */
  phase: { type: String, default: 'boot' },
  /** 0-1 真实加载进度 */
  progress: { type: Number, default: 0 },
  /** 当前阶段文案 key 对应的已翻译字符串 */
  statusText: { type: String, default: '' },
})

const leaving = computed(() => props.phase === 'leaving')
const ready = computed(() => props.phase === 'ready' || props.phase === 'leaving')

const barStyle = computed(() => ({
  transform: `scaleX(${Math.min(1, Math.max(0.04, props.progress))})`,
}))

const statusLine = computed(() => props.statusText || t('splashHint'))
</script>

<template>
  <div
    class="splash"
    :class="{ leaving, ready }"
    role="status"
    :aria-busy="!ready"
    :aria-valuemin="0"
    :aria-valuemax="100"
    :aria-valuenow="Math.round(Math.min(1, Math.max(0, progress)) * 100)"
    :aria-label="statusLine"
  >
    <div class="stage" aria-hidden="true">
      <div class="glow" />

      <!-- Ambient floating particles -->
      <div class="particles">
        <span v-for="i in 8" :key="i" class="particle" :class="`p${i}`" />
      </div>

      <div class="match-wrapper" :class="{ 'is-ready': ready }">
        <div class="match">
          <div class="flame" :class="{ on: ready }">
            <span class="flame-outer" />
            <span class="flame-mid" />
            <span class="flame-core" />
          </div>
          <div class="head" />
          <div class="stick" />
        </div>
      </div>
      <div class="floor" />
    </div>

    <div class="meta-container">
      <div class="meta">
        <p class="brand">{{ t('brand') }}</p>
        <p class="hint">{{ statusLine }}</p>
        <div class="track" aria-hidden="true">
          <div class="bar" :style="barStyle">
            <div class="bar-scanline" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.splash {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-content: center;
  gap: clamp(36px, 8vh, 64px);
  padding:
    calc(24px + var(--safe-top))
    calc(24px + var(--safe-right))
    calc(28px + var(--safe-bottom))
    calc(24px + var(--safe-left));
  background: #fff;
  color: #111;
  opacity: 1;
  clip-path: circle(150% at 50% 50%);
  transition:
    clip-path 0.9s cubic-bezier(0.76, 0, 0.24, 1),
    opacity 0.9s cubic-bezier(0.22, 1, 0.36, 1),
    visibility 0.9s;
}

.splash.leaving {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  clip-path: circle(0% at 50% 45%);
}

.stage {
  position: relative;
  width: min(160px, 36vw);
  height: min(240px, 42vh);
  margin: 0 auto;
  display: grid;
  place-items: center;
}

.floor {
  position: absolute;
  left: 50%;
  bottom: 8%;
  width: 58%;
  height: 14px;
  transform: translateX(-50%);
  border-radius: 50%;
  background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0.06), transparent 72%);
  filter: blur(2px);
  opacity: 0;
  animation: floor-in 1s cubic-bezier(0.22, 1, 0.36, 1) 0.2s forwards;
}

.glow {
  position: absolute;
  left: 50%;
  bottom: 42%;
  width: 72%;
  height: 48%;
  transform: translateX(-50%);
  border-radius: 50%;
  background: radial-gradient(ellipse at center, rgba(255, 140, 60, 0.16), transparent 70%);
  filter: blur(16px);
  opacity: 0;
  animation: glow-in 1.2s cubic-bezier(0.22, 1, 0.36, 1) 0.3s forwards;
}

.splash.ready .glow {
  animation: glow-breathe-ready 1.8s ease-in-out infinite;
}

/* Particles */
.particles {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 10;
}

.particle {
  position: absolute;
  width: 4px;
  height: 4px;
  background: #ffb15a;
  border-radius: 50%;
  opacity: 0;
  filter: blur(1px);
  box-shadow: 0 0 6px rgba(255, 106, 26, 0.6);
}

.p1 { left: 20%; bottom: 10%; animation: float-up 3.2s ease-in-out 0.1s infinite; }
.p2 { left: 75%; bottom: 25%; animation: float-up 4.1s ease-in-out 0.8s infinite; }
.p3 { left: 40%; bottom: 15%; animation: float-up 3.6s ease-in-out 1.2s infinite; }
.p4 { left: 60%; bottom: 30%; animation: float-up 4.5s ease-in-out 0.5s infinite; }
.p5 { left: 30%; bottom: 40%; animation: float-up 3.8s ease-in-out 1.5s infinite; }
.p6 { left: 80%; bottom: 10%; animation: float-up 4.2s ease-in-out 0.3s infinite; }
.p7 { left: 50%; bottom: 5%; animation: float-up 3.5s ease-in-out 2.0s infinite; }
.p8 { left: 65%; bottom: 45%; animation: float-up 4.0s ease-in-out 1.0s infinite; }

.match-wrapper {
  position: absolute;
  inset: 0;
  transform-origin: 50% 86%;
}

.match-wrapper.is-ready {
  animation: bounce-ready 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
}

.match {
  position: absolute;
  left: 50%;
  bottom: 14%;
  width: 28px;
  height: 180px;
  margin-left: -14px;
  transform-origin: 50% 100%;
  opacity: 0;
  animation: match-in 0.9s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

.stick {
  position: absolute;
  left: 50%;
  bottom: 0;
  width: 9px;
  height: 128px;
  margin-left: -4.5px;
  border-radius: 4px;
  background: linear-gradient(180deg, #e8cda8 0%, var(--wood, #d0a36e) 42%, var(--wood-deep, #8b5a2b) 100%);
}

.head {
  position: absolute;
  left: 50%;
  bottom: 120px;
  width: 15px;
  height: 17px;
  margin-left: -7.5px;
  border-radius: 50% 50% 46% 46%;
  background: radial-gradient(circle at 35% 30%, #4a3224, var(--head, #2d1e15) 72%);
  box-shadow: 0 0 0 0 rgba(255, 106, 26, 0.2);
  animation: head-pulse 2.2s ease-in-out infinite;
}

.splash.ready .head {
  box-shadow: 0 0 14px rgba(255, 106, 26, 0.35);
}

.flame {
  position: absolute;
  left: 50%;
  bottom: 128px;
  width: 36px;
  height: 56px;
  margin-left: -18px;
  transform: scale(0);
  transform-origin: 50% 100%;
  opacity: 0;
  filter: drop-shadow(0 0 10px rgba(255, 106, 26, 0.3));
}

.flame.on {
  opacity: 1;
  animation:
    flame-pop 0.55s cubic-bezier(0.2, 1.2, 0.3, 1) forwards,
    flame-breathe 2.8s ease-in-out 0.55s infinite;
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
  width: 30px;
  height: 52px;
  background: radial-gradient(
    ellipse at 50% 72%,
    rgba(255, 132, 40, 0.95),
    rgba(255, 70, 16, 0.12) 72%,
    transparent 78%
  );
}

.flame-mid {
  width: 18px;
  height: 38px;
  background: radial-gradient(ellipse at 50% 78%, #ffd27a, #ff7a28 68%, transparent 82%);
}

.flame-core {
  width: 9px;
  height: 20px;
  bottom: 2px;
  background: radial-gradient(ellipse at 50% 80%, #fff8e8, #ffe08a 62%, transparent 82%);
}

.meta-container {
  display: flex;
  justify-content: center;
  align-items: center;
  perspective: 1000px;
}

.meta {
  text-align: center;
  display: grid;
  gap: 12px;
  justify-items: center;
  padding: 24px 36px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.8);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.04), inset 0 0 0 1px rgba(255, 255, 255, 0.5);
  opacity: 0;
  transform: translateY(16px) rotateX(4deg);
  animation: meta-in 0.9s cubic-bezier(0.22, 1, 0.36, 1) 0.6s forwards;
}

.brand {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
  letter-spacing: 0.28em;
  color: #222;
  animation: brand-breathe 4s ease-in-out infinite;
}

.hint {
  margin: 0;
  font-size: 0.8rem;
  letter-spacing: 0.16em;
  color: var(--text-faint, #888);
}

.track {
  width: min(140px, 32vw);
  height: 4px;
  margin-top: 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.04);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.02);
  overflow: hidden;
  position: relative;
}

.bar {
  height: 100%;
  width: 100%;
  transform-origin: 0 50%;
  border-radius: inherit;
  background: linear-gradient(90deg, #ffb15a, #ff6a1a);
  box-shadow: 0 0 8px rgba(255, 106, 26, 0.4);
  transition: transform 0.45s cubic-bezier(0.22, 1, 0.36, 1);
  position: relative;
  overflow: hidden;
}

.bar-scanline {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.5), transparent);
  animation: scanline 1.5s linear infinite;
}

@keyframes match-in {
  from { opacity: 0; transform: translateY(24px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes floor-in {
  from { opacity: 0; transform: translateX(-50%) scale(0.8); }
  to { opacity: 1; transform: translateX(-50%) scale(1); }
}

@keyframes glow-in {
  from { opacity: 0; transform: translateX(-50%) scale(0.8); }
  to { opacity: 0.55; transform: translateX(-50%) scale(1); }
}

@keyframes glow-breathe-ready {
  0%, 100% { opacity: 0.55; transform: translateX(-50%) scale(1); }
  50% { opacity: 0.85; transform: translateX(-50%) scale(1.06); }
}

@keyframes meta-in {
  from { opacity: 0; transform: translateY(16px) rotateX(4deg); }
  to { opacity: 1; transform: translateY(0) rotateX(0); }
}

@keyframes head-pulse {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.12); }
}

@keyframes flame-pop {
  0% { transform: scale(0) translateY(6px); opacity: 0; }
  70% { transform: scale(1.08); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

@keyframes flame-breathe {
  0%, 100% { transform: scale(1) translateY(0) rotate(-1deg); }
  50% { transform: scale(1.05) translateY(-2px) rotate(1deg); }
}

@keyframes bounce-ready {
  0% { transform: scale(1); }
  40% { transform: scale(1.06) translateY(-4px); }
  70% { transform: scale(0.98) translateY(2px); }
  100% { transform: scale(1) translateY(0); }
}

@keyframes float-up {
  0% { transform: translateY(0) scale(0.5); opacity: 0; }
  20% { opacity: 0.8; }
  80% { opacity: 0.8; }
  100% { transform: translateY(-80px) scale(1.2); opacity: 0; }
}

@keyframes brand-breathe {
  0%, 100% { letter-spacing: 0.28em; opacity: 1; }
  50% { letter-spacing: 0.34em; opacity: 0.85; }
}

@keyframes scanline {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

@media (prefers-reduced-motion: reduce) {
  .match, .meta, .glow, .head, .flame.on, .particle, .bar-scanline, .brand, .floor, .match-wrapper {
    animation: none !important;
  }
  .match, .meta, .floor { opacity: 1; transform: none; }
  .glow { opacity: 0.55; }
  .flame.on { opacity: 1; transform: scale(1); }
  .splash { transition-duration: 0.2s; clip-path: none !important; }
  .splash.leaving { clip-path: none !important; }
  .bar { transition: none; }
}
</style>
