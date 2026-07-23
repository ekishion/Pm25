<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { X } from 'lucide-vue-next'
import { t } from '../i18n'
import { renderShareCard, canvasToBlob, shareOrDownloadCard } from '../utils/shareCard'

const props = defineProps({
  open: { type: Boolean, default: false },
  payload: { type: Object, default: () => ({}) },
  /** 全局隐私模式：默认隐藏位置，并锁定分享脱敏 */
  privacy: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'done'])

const ratio = ref('portrait')
const hidePlace = ref(false)
const previewUrl = ref('')
const busy = ref(false)

const canSystemShare = computed(() => typeof navigator !== 'undefined' && typeof navigator.share === 'function')

const effectiveHidePlace = computed(() => props.privacy || hidePlace.value)

async function rebuild() {
  if (!props.open) return
  busy.value = true
  try {
    const canvas = await renderShareCard({
      ...props.payload,
      ratio: ratio.value,
      hidePlace: effectiveHidePlace.value,
      privacy: props.privacy,
      // 隐私模式下不把坐标塞进画布
      lat: props.privacy ? null : props.payload?.lat,
      lon: props.privacy ? null : props.payload?.lon,
      place: props.privacy ? '' : props.payload?.place,
    })
    const blob = await canvasToBlob(canvas)
    canvas.width = 0
    canvas.height = 0
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = URL.createObjectURL(blob)
  } catch {
    previewUrl.value = ''
  } finally {
    busy.value = false
  }
}

watch(
  () => [props.open, props.privacy],
  ([open, privacy]) => {
    if (open && privacy) hidePlace.value = true
  },
)

watch(
  () => [props.open, ratio.value, hidePlace.value, props.privacy, props.payload],
  () => {
    if (props.open) rebuild()
  },
  { deep: true },
)

onUnmounted(() => {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
})

async function save() {
  busy.value = true
  try {
    const result = await shareOrDownloadCard({
      ...props.payload,
      ratio: ratio.value,
      hidePlace: effectiveHidePlace.value,
      privacy: props.privacy,
      lat: props.privacy ? null : props.payload?.lat,
      lon: props.privacy ? null : props.payload?.lon,
      place: props.privacy ? '' : props.payload?.place,
    })
    emit('done', result.method)
    if (result.method !== 'cancelled') emit('close')
  } catch {
    emit('done', 'fail')
  } finally {
    busy.value = false
  }
}

function onBackdrop(e) {
  if (e.target === e.currentTarget) emit('close')
}
</script>

<template>
  <Transition name="modal">
    <div v-if="open" class="sheet" role="dialog" aria-modal="true" :aria-label="t('shareTitle')" @click="onBackdrop">
      <div class="panel" @click.stop>
        <header class="head">
          <h2>{{ t('shareTitle') }}</h2>
          <button type="button" class="x" :aria-label="t('close')" @click="emit('close')">
            <X :size="18" :stroke-width="2" />
          </button>
        </header>

        <div class="preview" :class="{ square: ratio === 'square' }">
          <img v-if="previewUrl" :src="previewUrl" alt="" />
          <div v-else class="ph">{{ busy ? t('sharing') : '…' }}</div>
        </div>

        <div class="opts">
          <div class="seg">
            <button type="button" :class="{ on: ratio === 'portrait' }" @click="ratio = 'portrait'">
              {{ t('sharePortrait') }}
            </button>
            <button type="button" :class="{ on: ratio === 'square' }" @click="ratio = 'square'">
              {{ t('shareSquare') }}
            </button>
          </div>
          <button
            type="button"
            class="toggle"
            :aria-pressed="effectiveHidePlace"
            :disabled="privacy"
            @click="hidePlace = !hidePlace"
          >
            {{ effectiveHidePlace ? t('includePlace') : t('hidePlace') }}
          </button>
          <p v-if="privacy" class="privacy-note">{{ t('privacyHint') }}</p>
        </div>

        <div class="actions">
          <button type="button" class="primary" :disabled="busy" @click="save">
            {{ canSystemShare ? t('systemShare') : t('save') }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.sheet {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: end center;
  padding: 16px;
  background: rgba(255, 255, 255, 0.48);
  backdrop-filter: blur(14px) saturate(150%);
  -webkit-backdrop-filter: blur(14px) saturate(150%);
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.35s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .panel {
  animation: panel-enter 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.modal-leave-active .panel {
  animation: panel-leave 0.32s cubic-bezier(0.4, 0, 0.2, 1) both;
}

@keyframes panel-enter {
  0% {
    opacity: 0;
    transform: translateY(28px) scale(0.97);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes panel-leave {
  0% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  100% {
    opacity: 0;
    transform: translateY(18px) scale(0.98);
  }
}

.panel {
  width: min(400px, 100%);
  max-height: min(92dvh, 860px);
  overflow: auto;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: blur(24px) saturate(160%);
  -webkit-backdrop-filter: blur(24px) saturate(160%);
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.8);
  padding: 14px 14px 16px;
}

button {
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.3s ease, box-shadow 0.3s ease, color 0.3s ease;
  cursor: pointer;
}

button:hover:not(:disabled) {
  transform: scale(1.02);
}

button:active:not(:disabled) {
  transform: scale(0.96);
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  padding: 0 4px;
}

.head h2 {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: #666;
}

.x {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #999;
  background: rgba(255, 255, 255, 0.5);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.4);
  padding: 0;
}

.x:hover {
  background: rgba(255, 255, 255, 0.9);
  color: #111;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 1);
  transform: scale(1.05);
}

.x:active {
  transform: scale(0.95);
}

.preview {
  aspect-ratio: 3 / 4;
  border-radius: 16px;
  overflow: hidden;
  background: linear-gradient(180deg, #fff 0%, #fff8f2 100%);
  box-shadow:
    inset 0 2px 10px rgba(0, 0, 0, 0.05),
    0 8px 28px rgba(0, 0, 0, 0.05);
  display: grid;
  place-items: center;
  position: relative;
  transition: aspect-ratio 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.preview.square {
  aspect-ratio: 1;
}

.preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  animation: img-fade-in 0.5s ease-out forwards;
}

@keyframes img-fade-in {
  from { opacity: 0; filter: blur(4px); }
  to { opacity: 1; filter: blur(0); }
}

.ph {
  color: #bbb;
  font-size: 0.85rem;
  letter-spacing: 0.08em;
}

.opts {
  display: grid;
  gap: 8px;
  margin: 12px 0 10px;
}

.seg {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 4px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.04);
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.02);
}

.seg button,
.toggle,
.primary {
  min-height: 42px;
  border-radius: 999px;
  font-size: 0.88rem;
  letter-spacing: 0.04em;
  color: #666;
  border: 1px solid transparent;
}

.seg button.on {
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  color: #111;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.6);
  font-weight: 500;
}

.toggle {
  background: rgba(255, 255, 255, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.02);
}

.toggle[aria-pressed='true'] {
  color: #111;
  background: rgba(255, 255, 255, 0.7);
  border-color: rgba(255, 255, 255, 0.8);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.toggle:disabled {
  opacity: 0.55;
  cursor: default;
  transform: scale(1) !important;
}

.privacy-note {
  margin: 0;
  text-align: center;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  color: #a0a0a0;
}

.primary {
  width: 100%;
  font-weight: 600;
  background: #111;
  color: #fff;
  border: 1px solid #000;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.primary:hover:not(:disabled) {
  background: linear-gradient(135deg, #222, #333);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.primary:disabled {
  opacity: 0.5;
  transform: scale(1) !important;
  box-shadow: none;
}

@media (min-width: 720px) {
  .sheet {
    place-items: center;
  }
}


@media (max-width: 719px) {
  .sheet {
    background: rgba(255, 255, 255, 0.62);
    backdrop-filter: blur(8px) saturate(140%);
    -webkit-backdrop-filter: blur(8px) saturate(140%);
  }

  .panel {
    background: rgba(255, 255, 255, 0.96);
    backdrop-filter: blur(12px) saturate(140%);
    -webkit-backdrop-filter: blur(12px) saturate(140%);
  }

  .seg button.on,
  .x {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .modal-enter-active,
  .modal-leave-active,
  .panel,
  button,
  .preview,
  .preview img {
    transition: none !important;
    animation: none !important;
  }
}
</style>

