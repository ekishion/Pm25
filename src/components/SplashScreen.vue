<script setup>
import { computed } from 'vue'
import { t } from '../i18n'

const props = defineProps({
  /** boot | ready | leaving */
  phase: { type: String, default: 'boot' },
  /** 0–1 真实加载进度 */
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
      <div class="match">
        <div class="flame" :class="{ on: ready }">
          <span class="flame-outer" />
          <span class="flame-mid" />
          <span class="flame-core" />
        </div>
        <div class="head" />
        <div class="stick" />
      </div>
      <div class="floor" />
    </div>

    <div class="meta">
      <p class="brand">{{ t('brand') }}</p>
      <p class="hint">{{ statusLine }}</p>
      <div class="track" aria-hidden="true">
        <div class="bar" :style="barStyle" />
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
  transition:
    opacity 0.7s cubic-bezier(0.22, 1, 0.36, 1),
    visibility 0.7s;
}

.splash.leaving {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
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
  opacity: 0.55;
  animation: glow-breathe 2.4s ease-in-out infinite;
}

.splash.ready .glow {
  opacity: 0.85;
  animation-duration: 1.8s;
}

.match {
  position: absolute;
  left: 50%;
  bottom: 14%;
  width: 28px;
  height: 180px;
  margin-left: -14px;
  transform-origin: 50% 100%;
  animation: match-in 0.9s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.stick {
  position: absolute;
  left: 50%;
  bottom: 0;
  width: 9px;
  height: 128px;
  margin-left: -4.5px;
  border-radius: 4px;
  background: linear-gradient(180deg, #e8cda8 0%, var(--wood) 42%, var(--wood-deep) 100%);
}

.head {
  position: absolute;
  left: 50%;
  bottom: 120px;
  width: 15px;
  height: 17px;
  margin-left: -7.5px;
  border-radius: 50% 50% 46% 46%;
  background: radial-gradient(circle at 35% 30%, #4a3224, var(--head) 72%);
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

.meta {
  text-align: center;
  display: grid;
  gap: 10px;
  justify-items: center;
  animation: meta-in 0.8s cubic-bezier(0.22, 1, 0.36, 1) 0.15s both;
}

.brand {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: 0.28em;
  color: #222;
}

.hint {
  margin: 0;
  font-size: 0.78rem;
  letter-spacing: 0.16em;
  color: var(--text-faint);
}

.track {
  width: min(120px, 28vw);
  height: 2px;
  margin-top: 6px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.06);
  overflow: hidden;
}

.bar {
  height: 100%;
  width: 100%;
  transform-origin: 0 50%;
  border-radius: inherit;
  background: linear-gradient(90deg, #ffb15a, #ff6a1a);
  transition: transform 0.45s cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes match-in {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes meta-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes head-pulse {
  0%,
  100% {
    filter: brightness(1);
  }
  50% {
    filter: brightness(1.12);
  }
}

@keyframes glow-breathe {
  0%,
  100% {
    opacity: 0.45;
    transform: translateX(-50%) scale(1);
  }
  50% {
    opacity: 0.8;
    transform: translateX(-50%) scale(1.06);
  }
}

@keyframes flame-pop {
  0% {
    transform: scale(0) translateY(6px);
    opacity: 0;
  }
  70% {
    transform: scale(1.08);
    opacity: 1;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes flame-breathe {
  0%,
  100% {
    transform: scale(1) translateY(0) rotate(-1deg);
  }
  50% {
    transform: scale(1.05) translateY(-2px) rotate(1deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .match,
  .meta,
  .glow,
  .head,
  .flame.on {
    animation: none !important;
  }

  .flame.on {
    opacity: 1;
    transform: scale(1);
  }

  .splash {
    transition-duration: 0.2s;
  }

  .bar {
    transition: none;
  }
}
</style>
