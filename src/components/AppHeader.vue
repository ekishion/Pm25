<script setup>
import { EyeOff, Eye, MapPin, Share2, Volume2, VolumeX, Languages } from 'lucide-vue-next'
import { getLocale, t } from '../i18n'

defineProps({
  place: { type: String, default: '' },
  privacyOn: { type: Boolean, default: false },
  entered: { type: Boolean, default: false },
  splashMounted: { type: Boolean, default: true },
  issueStamp: { type: String, default: '' },
  showShareBtn: { type: Boolean, default: false },
  stage: { type: String, default: '' },
  soundOn: { type: Boolean, default: true },
})

const emit = defineEmits(['place-click', 'toggle-privacy', 'toggle-lang', 'share', 'toggle-sound'])
</script>

<template>
  <header class="top">
    <button
      type="button"
      class="place"
      :class="{ show: entered && (!!place || privacyOn), private: privacyOn }"
      :title="privacyOn ? t('privacyHint') : t('locateTitle')"
      @click="emit('place-click')"
    >
      <MapPin :size="14" :stroke-width="1.8" aria-hidden="true" />
      <span class="place-label">{{ place || ' ' }}</span>
    </button>

    <p class="pub-issue" :class="{ show: entered && !splashMounted }" aria-hidden="true">
      {{ issueStamp }}
    </p>

    <div class="top-actions">
      <button
        class="icon-btn visible"
        type="button"
        :aria-pressed="privacyOn"
        :aria-label="privacyOn ? t('privacyOn') : t('privacyOff')"
        :title="privacyOn ? t('privacyOn') : t('privacyOff')"
        @click="emit('toggle-privacy')"
      >
        <EyeOff v-if="privacyOn" :size="18" :stroke-width="1.6" aria-hidden="true" />
        <Eye v-else :size="18" :stroke-width="1.6" aria-hidden="true" />
      </button>

      <button
        class="icon-btn lang-btn visible"
        type="button"
        :aria-label="getLocale() === 'zh' ? 'English' : '中文'"
        @click="emit('toggle-lang')"
      >
        <span class="lang-switch" aria-hidden="true">
          <Languages :size="15" :stroke-width="1.6" />
          <span class="lang">{{ getLocale() === 'zh' ? 'EN' : '中' }}</span>
        </span>
      </button>

      <button
        class="icon-btn"
        type="button"
        :class="{ visible: showShareBtn && stage === 'burning' }"
        :disabled="!(showShareBtn && stage === 'burning')"
        :tabindex="showShareBtn && stage === 'burning' ? 0 : -1"
        :aria-hidden="!(showShareBtn && stage === 'burning')"
        :aria-label="t('share')"
        @click="emit('share')"
      >
        <Share2 :size="20" :stroke-width="1.6" aria-hidden="true" />
      </button>

      <button
        class="icon-btn visible"
        type="button"
        :aria-pressed="soundOn"
        :aria-label="soundOn ? t('soundOn') : t('soundOff')"
        @click="emit('toggle-sound')"
      >
        <Volume2 v-if="soundOn" :size="20" :stroke-width="1.6" aria-hidden="true" />
        <VolumeX v-else :size="20" :stroke-width="1.6" aria-hidden="true" />
      </button>
    </div>
  </header>
</template>

<style scoped>
.top {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, auto) minmax(0, 1fr);
  align-items: center;
  column-gap: 8px;
  min-width: 0;
  height: 48px;
  max-width: 100%;
}

.place {
  position: relative;
  z-index: 2;
  justify-self: start;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  max-width: 100%;
  height: 38px;
  padding: 0 14px;
  border-radius: 999px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  backdrop-filter: blur(24px) saturate(170%);
  -webkit-backdrop-filter: blur(24px) saturate(170%);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04), inset 0 1px 0 var(--glass-inner);
  font-size: 0.85rem;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: var(--text-soft);
  white-space: nowrap;
  opacity: 0;
  transform: translateY(-4px);
  transition: opacity 0.7s var(--ease-out) 0.12s, transform 0.7s var(--ease-out) 0.12s,
    color 0.2s ease, background 0.25s ease;
}

.place:hover { color: var(--text); background: var(--glass-bg-strong); }
.place:active { transform: scale(0.97); }
.place svg { flex: 0 0 auto; opacity: 0.65; }
.place-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.place.show { opacity: 1; transform: none; }
.place.private { letter-spacing: 0.1em; color: var(--text-faint); }

.pub-issue {
  pointer-events: none;
  position: relative;
  z-index: 0;
  margin: 0;
  justify-self: center;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--mono);
  font-size: 0.58rem;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-faint);
  opacity: 0;
  transition: opacity 0.8s ease 0.15s;
}

.pub-issue.show { opacity: 1; }

.top-actions {
  position: relative;
  z-index: 2;
  justify-self: end;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  flex: 0 0 auto;
  gap: 2px;
  min-width: 0;
  padding: 3px;
  border-radius: 999px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  backdrop-filter: blur(24px) saturate(170%);
  -webkit-backdrop-filter: blur(24px) saturate(170%);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04), inset 0 1px 0 var(--glass-inner);
}

.icon-btn {
  box-sizing: border-box;
  width: 36px;
  height: 36px;
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
  transition: color 0.2s ease, background 0.2s ease, opacity 0.35s ease, width 0.25s ease,
    transform 0.4s var(--ease-spring);
}

.icon-btn:not(.visible) { width: 0; opacity: 0; pointer-events: none; }
.icon-btn.visible { opacity: 1; pointer-events: auto; }
.icon-btn.visible:disabled { opacity: 0.35; pointer-events: none; }
.icon-btn:hover:not(:disabled) { color: var(--text); background: var(--hover-bg); transform: scale(1.08); }
.icon-btn:active:not(:disabled) { transform: scale(0.92); transition-duration: 0.1s; }
.icon-btn svg { display: block; }
.lang-switch { display: inline-flex; align-items: center; gap: 3px; line-height: 1; }
.lang { font-size: 0.68rem; font-weight: 600; letter-spacing: 0.02em; line-height: 1; }
.lang-btn { width: auto; min-width: 36px; padding: 0 10px; border-radius: 999px; overflow: visible; }
.icon-btn:focus-visible, .place:focus-visible { outline: 2px solid var(--ink-faint); outline-offset: 2px; }

@media (max-width: 1024px) {
  .top { grid-template-columns: minmax(0, 1fr) auto; }
  .pub-issue { display: none !important; }
}

@media (max-width: 480px) {
  .top { height: 44px; }
  .place { height: 34px; padding: 0 11px; gap: 5px; font-size: 0.8rem; }
  .top-actions { padding: 2px; }
  .icon-btn { width: 32px; height: 32px; }
  .icon-btn.lang-btn { width: 32px; min-width: 32px; padding: 0; }
  .lang-switch svg { display: none; }
  .lang { font-size: 0.72rem; }
  .icon-btn:not(.visible) { width: 0; min-width: 0; padding: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .top, .place, .icon-btn { transition: none !important; animation: none !important; }
  .place { opacity: 1; transform: none; }
}
</style>
