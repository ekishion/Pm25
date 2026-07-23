<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { prefersReducedMotion } from '../utils/animate'

const props = defineProps({
  /** 空气质量强度 0–1，影响光标暖色 */
  intensity: { type: Number, default: 0.2 },
})

const wrapRef = ref(null)
const dotRef = ref(null)
const ringRef = ref(null)

let dotX = 0
let dotY = 0
let ringX = 0
let ringY = 0
let targetX = 0
let targetY = 0
let visible = false
let hovering = false
let pressing = false
let raf = 0
let enabled = false
let hoverTick = 0
let finePointerMq = null
let hoverMq = null
let motionMq = null

const SPRING = {
  dot: 0.28,
  ring: 0.12,
}

function clamp01(n) {
  return Math.min(1, Math.max(0, Number(n) || 0))
}

function applyIntensityStyle() {
  const i = clamp01(props.intensity)
  const el = wrapRef.value
  if (!el) return
  // 高强度更偏琥珀
  const ring = `rgba(255, ${Math.round(140 - i * 40)}, ${Math.round(40 + i * 10)}, ${0.18 + i * 0.22})`
  const fill = `rgba(255, ${Math.round(120 - i * 30)}, 30, ${0.03 + i * 0.06})`
  el.style.setProperty('--cursor-ring', ring)
  el.style.setProperty('--cursor-fill', fill)
  el.style.setProperty('--cursor-core', i > 0.45 ? 'var(--flame, #ff6a1a)' : 'var(--text, #141414)')
}

function supportsCustomCursor() {
  try {
    if (prefersReducedMotion()) return false
    const fine = window.matchMedia('(pointer: fine)').matches
    const hover = window.matchMedia('(hover: hover)').matches
    return fine && hover
  } catch {
    return false
  }
}

function onMouseMove(e) {
  targetX = e.clientX
  targetY = e.clientY
  if (!visible) {
    visible = true
    dotX = targetX
    dotY = targetY
    ringX = targetX
    ringY = targetY
    updateVisibility()
  }
}

function onMouseLeave() {
  visible = false
  updateVisibility()
}

function onMouseEnter() {
  if (enabled) {
    visible = true
    updateVisibility()
  }
}

function onMouseDown() {
  pressing = true
  updatePressingClass()
}

function onMouseUp() {
  pressing = false
  updatePressingClass()
}

function updateVisibility() {
  if (dotRef.value) dotRef.value.classList.toggle('visible', visible)
  if (ringRef.value) ringRef.value.classList.toggle('visible', visible)
}

function updatePressingClass() {
  if (ringRef.value) ringRef.value.classList.toggle('pressing', pressing)
  if (dotRef.value) dotRef.value.classList.toggle('pressing', pressing)
}

function checkHover() {
  // 每 3 帧检测一次，降低 elementFromPoint 成本
  hoverTick = (hoverTick + 1) % 3
  if (hoverTick !== 0) return

  const el = document.elementFromPoint(targetX, targetY)
  if (!el) {
    if (hovering) {
      hovering = false
      if (ringRef.value) ringRef.value.classList.remove('hovering')
      if (dotRef.value) dotRef.value.classList.remove('hovering')
    }
    return
  }
  const interactive =
    el.closest('button') ||
    el.closest('a') ||
    el.closest('[role="button"]') ||
    el.closest('input') ||
    el.closest('textarea') ||
    el.closest('[data-cursor-hover]')
  const next = !!interactive
  if (next !== hovering) {
    hovering = next
    if (ringRef.value) ringRef.value.classList.toggle('hovering', hovering)
    if (dotRef.value) dotRef.value.classList.toggle('hovering', hovering)
  }
}

function animate() {
  if (!enabled) return

  dotX += (targetX - dotX) * SPRING.dot
  dotY += (targetY - dotY) * SPRING.dot
  ringX += (targetX - ringX) * SPRING.ring
  ringY += (targetY - ringY) * SPRING.ring

  if (dotRef.value) {
    dotRef.value.style.transform = `translate(${dotX}px, ${dotY}px) translate(-50%, -50%)`
  }
  if (ringRef.value) {
    ringRef.value.style.transform = `translate(${ringX}px, ${ringY}px) translate(-50%, -50%)`
  }

  checkHover()
  raf = requestAnimationFrame(animate)
}

function disableCursor() {
  enabled = false
  visible = false
  pressing = false
  hovering = false
  if (raf) {
    cancelAnimationFrame(raf)
    raf = 0
  }
  document.documentElement.classList.remove('custom-cursor')
  updateVisibility()
  if (ringRef.value) {
    ringRef.value.classList.remove('hovering', 'pressing')
  }
  if (dotRef.value) {
    dotRef.value.classList.remove('hovering', 'pressing')
  }
  window.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseleave', onMouseLeave)
  document.removeEventListener('mouseenter', onMouseEnter)
  window.removeEventListener('mousedown', onMouseDown)
  window.removeEventListener('mouseup', onMouseUp)
}

function enableCursor() {
  if (enabled || !supportsCustomCursor()) return
  enabled = true
  document.documentElement.classList.add('custom-cursor')
  applyIntensityStyle()
  window.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseleave', onMouseLeave)
  document.addEventListener('mouseenter', onMouseEnter)
  window.addEventListener('mousedown', onMouseDown)
  window.addEventListener('mouseup', onMouseUp)
  raf = requestAnimationFrame(animate)
}

function syncCursor() {
  if (supportsCustomCursor()) enableCursor()
  else disableCursor()
}

function onMqChange() {
  syncCursor()
}

watch(
  () => props.intensity,
  () => applyIntensityStyle(),
)

onMounted(() => {
  try {
    finePointerMq = window.matchMedia('(pointer: fine)')
    hoverMq = window.matchMedia('(hover: hover)')
    motionMq = window.matchMedia('(prefers-reduced-motion: reduce)')
    finePointerMq.addEventListener?.('change', onMqChange)
    hoverMq.addEventListener?.('change', onMqChange)
    motionMq.addEventListener?.('change', onMqChange)
    finePointerMq.addListener?.(onMqChange)
    hoverMq.addListener?.(onMqChange)
    motionMq.addListener?.(onMqChange)
  } catch {
    /* ignore */
  }
  applyIntensityStyle()
  syncCursor()
})

onUnmounted(() => {
  disableCursor()
  try {
    finePointerMq?.removeEventListener?.('change', onMqChange)
    hoverMq?.removeEventListener?.('change', onMqChange)
    motionMq?.removeEventListener?.('change', onMqChange)
    finePointerMq?.removeListener?.(onMqChange)
    hoverMq?.removeListener?.(onMqChange)
    motionMq?.removeListener?.(onMqChange)
  } catch {
    /* ignore */
  }
  finePointerMq = null
  hoverMq = null
  motionMq = null
})
</script>

<template>
  <div ref="wrapRef" class="cursor-wrap" aria-hidden="true">
    <div ref="dotRef" class="cursor-dot" />
    <div ref="ringRef" class="cursor-ring" />
  </div>
</template>

<style scoped>
.cursor-wrap {
  --cursor-ring: rgba(0, 0, 0, 0.12);
  --cursor-fill: transparent;
  --cursor-core: var(--text, #141414);
  position: fixed;
  inset: 0;
  z-index: 9999;
  pointer-events: none;
  overflow: hidden;
}

.cursor-dot {
  position: absolute;
  top: 0;
  left: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--cursor-core);
  opacity: 0;
  transition:
    opacity 0.3s ease,
    width 0.25s cubic-bezier(0.22, 1, 0.36, 1),
    height 0.25s cubic-bezier(0.22, 1, 0.36, 1),
    background 0.4s ease;
  will-change: transform;
}

.cursor-dot.visible {
  opacity: 1;
}

.cursor-dot.hovering {
  width: 8px;
  height: 8px;
  background: var(--flame, #ff6a1a);
}

.cursor-dot.pressing {
  width: 4px;
  height: 4px;
}

.cursor-ring {
  position: absolute;
  top: 0;
  left: 0;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1.5px solid var(--cursor-ring);
  background: var(--cursor-fill);
  opacity: 0;
  transition:
    opacity 0.3s ease,
    width 0.35s cubic-bezier(0.22, 1, 0.36, 1),
    height 0.35s cubic-bezier(0.22, 1, 0.36, 1),
    border-color 0.4s ease,
    background 0.3s ease;
  will-change: transform;
}

.cursor-ring.visible {
  opacity: 1;
}

.cursor-ring.hovering {
  width: 52px;
  height: 52px;
  border-color: rgba(255, 106, 26, 0.3);
  background: rgba(255, 106, 26, 0.04);
}

.cursor-ring.pressing {
  width: 28px;
  height: 28px;
  border-color: rgba(255, 106, 26, 0.5);
}

@media (hover: none), (pointer: coarse) {
  .cursor-wrap {
    display: none !important;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cursor-wrap {
    display: none !important;
  }
}
</style>
