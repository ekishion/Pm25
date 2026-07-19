<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { t } from '../i18n'
import { renderShareCard, canvasToBlob, shareOrDownloadCard } from '../utils/shareCard'

const props = defineProps({
  open: { type: Boolean, default: false },
  payload: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['close', 'done'])

const ratio = ref('portrait')
const hidePlace = ref(false)
const previewUrl = ref('')
const busy = ref(false)

const canSystemShare = computed(() => typeof navigator !== 'undefined' && typeof navigator.share === 'function')

async function rebuild() {
  if (!props.open) return
  busy.value = true
  try {
    const canvas = await renderShareCard({
      ...props.payload,
      ratio: ratio.value,
      hidePlace: hidePlace.value,
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
  () => [props.open, ratio.value, hidePlace.value, props.payload],
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
      hidePlace: hidePlace.value,
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
        <button type="button" class="toggle" :aria-pressed="hidePlace" @click="hidePlace = !hidePlace">
          {{ hidePlace ? t('includePlace') : t('hidePlace') }}
        </button>
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
  width: min(420px, 100%);
  max-height: min(92dvh, 860px);
  overflow: auto;
  border-radius: 20px;
  border: 1px solid rgba(0, 0, 0, 0.06);
  background: #fff;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.08);
  padding: 16px 16px 18px;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.head h2 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  color: #666;
}

.x {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  font-size: 1.4rem;
  line-height: 1;
  color: #999;
}

.x:hover {
  background: rgba(0, 0, 0, 0.04);
  color: #111;
}

.preview {
  aspect-ratio: 3 / 4;
  border-radius: 14px;
  overflow: hidden;
  background: #fafafa;
  border: 1px solid rgba(0, 0, 0, 0.04);
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
  letter-spacing: 0.12em;
}

.opts {
  display: grid;
  gap: 10px;
  margin: 14px 0;
}

.seg {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  padding: 4px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.03);
}

.seg button,
.toggle,
.primary {
  min-height: 40px;
  border-radius: 999px;
  font-size: 0.88rem;
  letter-spacing: 0.06em;
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

.primary {
  width: 100%;
  color: #111;
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
