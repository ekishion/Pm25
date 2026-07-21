<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
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
  <div v-if="open" class="sheet" role="dialog" aria-modal="true" :aria-label="t('shareTitle')" @click="onBackdrop">
    <div class="panel" @click.stop>
      <header class="head">
        <h2>{{ t('shareTitle') }}</h2>
        <button type="button" class="x" :aria-label="t('close')" @click="emit('close')">×</button>
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
</template>

<style scoped>
.sheet {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: end center;
  padding: 16px;
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(10px);
}

.panel {
  width: min(400px, 100%);
  max-height: min(92dvh, 860px);
  overflow: auto;
  border-radius: 22px;
  border: 1px solid rgba(0, 0, 0, 0.06);
  background: #fff;
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.1);
  padding: 14px 14px 16px;
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
  font-size: 1.35rem;
  line-height: 1;
  color: #999;
}

.x:hover {
  background: rgba(0, 0, 0, 0.04);
  color: #111;
}

.preview {
  aspect-ratio: 3 / 4;
  border-radius: 16px;
  overflow: hidden;
  background: linear-gradient(180deg, #fff 0%, #fff8f2 100%);
  box-shadow:
    inset 0 0 0 1px rgba(0, 0, 0, 0.04),
    0 8px 28px rgba(0, 0, 0, 0.05);
  display: grid;
  place-items: center;
}

.preview.square {
  aspect-ratio: 1;
}

.preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
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
  padding: 3px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.035);
}

.seg button,
.toggle,
.primary {
  min-height: 42px;
  border-radius: 999px;
  font-size: 0.88rem;
  letter-spacing: 0.04em;
  color: #666;
}

.seg button.on {
  background: #fff;
  color: #111;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.toggle {
  border: 1px solid rgba(0, 0, 0, 0.06);
}

.toggle[aria-pressed='true'] {
  color: #111;
  border-color: rgba(0, 0, 0, 0.12);
}

.toggle:disabled {
  opacity: 0.55;
  cursor: default;
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
}

.primary:disabled {
  opacity: 0.5;
}

@media (min-width: 720px) {
  .sheet {
    place-items: center;
  }
}
</style>
