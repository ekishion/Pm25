<script setup>
import { t } from '../i18n'

defineProps({
  visible: { type: Boolean, default: false },
  reveal: { type: Boolean, default: false },
  stage: { type: String, default: '' },
  quotaExceeded: { type: Boolean, default: false },
  offScale: { type: Boolean, default: false },
  overline: { type: String, default: '' },
  displayCount: { type: [Number, String], default: '' },
  unit: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  pm25: { type: Number, default: null },
  aqi: { type: Number, default: null },
  quotaHint: { type: String, default: '' },
  historyLine: { type: String, default: '' },
  updatedLine: { type: String, default: '' },
  offline: { type: Boolean, default: false },
})
</script>

<template>
  <div
    class="readout"
    :class="{
      show: visible,
      reveal,
      'off-scale': offScale,
    }"
  >
    <p v-if="stage === 'burning' && !quotaExceeded" class="overline">{{ overline }}</p>
    <div class="count">
      <span class="num" :class="{ muted: quotaExceeded }">{{ displayCount }}</span>
      <span class="unit">{{ unit }}</span>
    </div>
    <div v-if="stage === 'burning' && subtitle && !quotaExceeded" class="mode-line" :class="{ warn: offScale }">
      {{ subtitle }}
    </div>
    <div class="hairline" aria-hidden="true" />
    <div class="meta">
      <span v-if="quotaExceeded">{{ t('quotaTitle') }}</span>
      <span v-else-if="stage === 'failed'">{{ t('failHint') }}</span>
      <template v-else>
        <span v-if="pm25 != null">PM2.5 {{ Math.round(pm25) }}</span>
        <span v-if="aqi != null">AQI {{ aqi }}</span>
      </template>
    </div>
    <div v-if="quotaExceeded" class="submeta">{{ quotaHint }}</div>
    <div v-else-if="offScale && stage === 'burning'" class="submeta warn">{{ t('offScaleHint') }}</div>
    <div v-else-if="historyLine && stage === 'burning'" class="submeta">{{ historyLine }}</div>
    <div v-else-if="updatedLine && stage === 'burning'" class="submeta">{{ updatedLine }}</div>
    <div v-else-if="offline" class="submeta">{{ t('offline') }}</div>
  </div>
</template>

<style scoped>
.readout { position: relative; z-index: 2; flex: 0 0 auto; width: min(100%, 420px); text-align: center; margin-top: 0; opacity: 0; transform: translateY(14px); pointer-events: none; }
.readout.show:not(.reveal) { opacity: 1; transform: none; transition: opacity 0.5s ease, transform 0.5s ease; }
.readout.reveal { opacity: 1; transform: none; animation: readout-enter 0.9s var(--ease-out) both; }
.readout.reveal .overline { animation: reveal-fade 0.7s var(--ease-out) 0.05s both; }
.readout.reveal .num { animation: numeral-focus 1.65s var(--ease-focus) both; }
.readout.reveal .unit { animation: reveal-fade 0.85s var(--ease-out) 0.2s both; }
.readout.reveal .mode-line { animation: reveal-fade 0.85s var(--ease-out) 0.35s both; }
.readout.reveal .hairline { animation: hairline-draw 0.7s var(--ease-out) 0.45s both; }
.readout.reveal .meta { animation: reveal-fade 0.8s var(--ease-out) 0.55s both; }
.readout.reveal .submeta { animation: reveal-fade 0.75s var(--ease-out) 0.7s both; }
.overline { margin: 0 0 8px; font-family: var(--mono); font-size: 0.58rem; font-weight: 500; letter-spacing: 0.26em; text-transform: uppercase; color: var(--text-faint); }
.count { display: flex; align-items: baseline; justify-content: center; gap: 10px; }
.num { display: inline-block; font-family: var(--font-display); font-size: clamp(3.2rem, 11vw, 5rem); font-weight: 600; font-variant-numeric: tabular-nums; letter-spacing: -0.06em; line-height: 0.92; color: var(--text); transform-origin: 50% 70%; will-change: filter, transform, opacity; }
.num.muted { color: var(--text-faint); animation: none !important; filter: none !important; }
.readout.off-scale .num { letter-spacing: -0.04em; }
.unit { font-size: 0.9rem; color: var(--text-soft); letter-spacing: 0.08em; }
.mode-line { margin-top: 6px; font-family: var(--font-editorial); font-size: 1.05rem; font-style: italic; font-weight: 500; letter-spacing: 0.05em; color: var(--text-soft); }
.mode-line.warn, .submeta.warn { color: var(--warn); }
.hairline { width: min(88px, 24vw); height: 1px; margin: 12px auto 0; background: var(--line-soft); transform-origin: 50% 50%; }
.meta { margin-top: 12px; display: flex; justify-content: center; flex-wrap: wrap; gap: 6px; }
.meta span { display: inline-flex; align-items: center; padding: 6px 13px; border-radius: 999px; background: var(--chip-bg); border: 1px solid var(--glass-border); backdrop-filter: blur(16px) saturate(160%); -webkit-backdrop-filter: blur(16px) saturate(160%); color: var(--text-soft); font-family: var(--mono); font-size: 0.66rem; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; }
.submeta { margin-top: 8px; min-height: 1.1em; display: flex; justify-content: center; flex-wrap: wrap; gap: 8px 12px; color: var(--text-faint); font-size: 0.7rem; letter-spacing: 0.08em; opacity: 0.88; }
@keyframes readout-enter { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
@keyframes numeral-focus { 0% { opacity: 0.08; filter: blur(22px); transform: scale(1.14); letter-spacing: 0.08em; } 25% { opacity: 0.55; filter: blur(10px); transform: scale(1.06); letter-spacing: 0.01em; } 55% { opacity: 0.92; filter: blur(3px); transform: scale(1.02); letter-spacing: -0.04em; } 80% { opacity: 1; filter: blur(0.5px); transform: scale(0.995); letter-spacing: -0.058em; } 100% { opacity: 1; filter: blur(0); transform: scale(1); letter-spacing: -0.06em; } }
@keyframes reveal-fade { 0% { opacity: 0; transform: translateY(16px) scale(0.96); filter: blur(8px); } 70% { opacity: 1; transform: translateY(-2px) scale(1.01); filter: blur(0); } 100% { opacity: 1; transform: none; filter: blur(0); } }
@keyframes hairline-draw { from { opacity: 0; transform: scaleX(0.2); } to { opacity: 1; transform: scaleX(1); } }
@media (max-width: 480px) { .num { font-size: clamp(2.8rem, 12vw, 3.8rem); } .mode-line { font-size: 0.98rem; } }
@media (min-width: 960px) { .num { font-size: clamp(3.8rem, 6vw, 5rem); } }

@media (prefers-reduced-motion: reduce) {
  .readout, .readout.reveal, .readout.reveal .num, .readout.reveal .overline,
  .readout.reveal .unit, .readout.reveal .mode-line, .readout.reveal .hairline,
  .readout.reveal .meta, .readout.reveal .submeta {
    transition: none !important;
    animation: none !important;
  }
  .readout.show, .readout.reveal { opacity: 1; transform: none; filter: none; }
  .readout.reveal .num { filter: none; transform: none; opacity: 1; }
}
</style>
