<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { prefersReducedMotion } from '../utils/animate'

const props = defineProps({
  /** 空气质量强度 0–1，影响粒子密度与色温 */
  intensity: { type: Number, default: 0.2 },
  /** 是否已进入主界面 */
  active: { type: Boolean, default: false },
})

const canvasRef = ref(null)
let ctx = null
let raf = 0
let particles = []
let mouse = { x: -9999, y: -9999, active: false }
let width = 0
let height = 0
let dpr = 1
let running = false
let listenersBound = false
let motionMq = null

const CONFIG = {
  baseCount: 36,
  maxCount: 96,
  mobileBaseCount: 22,
  mobileMaxCount: 48,
  baseRadius: 1.2,
  maxRadius: 3,
  driftSpeed: 0.15,
  mouseRadius: 120,
  mouseForce: 0.8,
  fadeIn: 0.008,
  linkDist: 90,
  linkAlpha: 0.035,
}

function isMobileWidth() {
  return width > 0 ? width <= 768 : window.innerWidth <= 768
}

function targetCount() {
  const mobile = isMobileWidth()
  const base = mobile ? CONFIG.mobileBaseCount : CONFIG.baseCount
  const max = mobile ? CONFIG.mobileMaxCount : CONFIG.maxCount
  return Math.round(base + (max - base) * props.intensity)
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

function createParticle() {
  const i = props.intensity
  const r = CONFIG.baseRadius + Math.random() * (CONFIG.maxRadius - CONFIG.baseRadius) * (0.4 + i * 0.6)
  const warmth = Math.random() * i
  const baseHue = lerp(220, 28, warmth)
  const sat = lerp(5, 45, warmth)
  const light = lerp(72, 58, i * 0.5)
  const alpha = 0.08 + Math.random() * 0.18 + i * 0.06

  return {
    x: Math.random() * Math.max(width, 1),
    y: Math.random() * Math.max(height, 1),
    vx: (Math.random() - 0.5) * CONFIG.driftSpeed,
    vy: -CONFIG.driftSpeed * 0.5 - Math.random() * CONFIG.driftSpeed * 0.8,
    r,
    hue: baseHue,
    sat,
    light,
    alpha,
    targetAlpha: alpha,
    currentAlpha: 0,
    phase: Math.random() * Math.PI * 2,
    phaseSpeed: 0.003 + Math.random() * 0.008,
  }
}

function syncParticleCount() {
  const count = targetCount()
  while (particles.length < count) particles.push(createParticle())
  while (particles.length > count) particles.pop()
}

function initParticles() {
  particles = []
  const count = targetCount()
  for (let i = 0; i < count; i++) particles.push(createParticle())
}

function resize() {
  const canvas = canvasRef.value
  if (!canvas) return
  dpr = Math.min(window.devicePixelRatio || 1, 2)
  const rect = canvas.getBoundingClientRect()
  width = rect.width
  height = rect.height
  canvas.width = Math.max(1, Math.floor(width * dpr))
  canvas.height = Math.max(1, Math.floor(height * dpr))
  ctx = canvas.getContext('2d')
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  syncParticleCount()
}

function onMouseMove(e) {
  mouse.x = e.clientX
  mouse.y = e.clientY
  mouse.active = true
}

function onMouseLeave() {
  mouse.active = false
}

function onTouchMove(e) {
  if (e.touches.length > 0) {
    mouse.x = e.touches[0].clientX
    mouse.y = e.touches[0].clientY
    mouse.active = true
  }
}

function onTouchEnd() {
  mouse.active = false
}

function canRun() {
  return props.active && !prefersReducedMotion()
}

function bindListeners() {
  if (listenersBound) return
  window.addEventListener('resize', resize)
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseleave', onMouseLeave)
  window.addEventListener('touchmove', onTouchMove, { passive: true })
  window.addEventListener('touchend', onTouchEnd)
  listenersBound = true
}

function unbindListeners() {
  if (!listenersBound) return
  window.removeEventListener('resize', resize)
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseleave', onMouseLeave)
  window.removeEventListener('touchmove', onTouchMove)
  window.removeEventListener('touchend', onTouchEnd)
  listenersBound = false
}

function stopLoop() {
  running = false
  if (raf) {
    cancelAnimationFrame(raf)
    raf = 0
  }
  if (ctx && width && height) {
    ctx.clearRect(0, 0, width, height)
  }
  mouse.active = false
}

function startLoop() {
  if (running || !canRun()) return
  running = true
  resize()
  if (!particles.length) initParticles()
  else syncParticleCount()
  raf = requestAnimationFrame(draw)
}

function draw() {
  if (!running) return
  if (!canRun()) {
    stopLoop()
    return
  }

  if (!ctx || !width || !height) {
    raf = requestAnimationFrame(draw)
    return
  }

  ctx.clearRect(0, 0, width, height)

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]

    if (p.currentAlpha < p.targetAlpha) {
      p.currentAlpha = Math.min(p.targetAlpha, p.currentAlpha + CONFIG.fadeIn)
    }

    p.phase += p.phaseSpeed
    const drift = Math.sin(p.phase) * 0.3
    p.x += p.vx + drift * 0.1
    p.y += p.vy

    if (mouse.active) {
      const dx = p.x - mouse.x
      const dy = p.y - mouse.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < CONFIG.mouseRadius && dist > 0) {
        const force = (1 - dist / CONFIG.mouseRadius) * CONFIG.mouseForce
        p.x += (dx / dist) * force
        p.y += (dy / dist) * force
      }
    }

    if (p.y < -20) {
      p.y = height + 10
      p.x = Math.random() * width
    }
    if (p.x < -20) p.x = width + 10
    if (p.x > width + 20) p.x = -10

    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2.5)
    glow.addColorStop(0, `hsla(${p.hue}, ${p.sat}%, ${p.light}%, ${p.currentAlpha})`)
    glow.addColorStop(0.5, `hsla(${p.hue}, ${p.sat}%, ${p.light}%, ${p.currentAlpha * 0.4})`)
    glow.addColorStop(1, `hsla(${p.hue}, ${p.sat}%, ${p.light}%, 0)`)
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.r * 2.5, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = `hsla(${p.hue}, ${p.sat}%, ${Math.min(90, p.light + 15)}%, ${p.currentAlpha * 0.8})`
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.r * 0.6, 0, Math.PI * 2)
    ctx.fill()
  }

  // 桌面端稀疏连线：步长抽样，降低 O(n^2) 成本
  if (width > 768 && particles.length > 1) {
    ctx.strokeStyle = `rgba(0, 0, 0, ${CONFIG.linkAlpha * (0.3 + props.intensity * 0.7)})`
    ctx.lineWidth = 0.5
    const step = particles.length > 70 ? 2 : 1
    for (let i = 0; i < particles.length; i += step) {
      for (let j = i + step; j < particles.length; j += step) {
        const dx = particles[i].x - particles[j].x
        const dy = particles[i].y - particles[j].y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < CONFIG.linkDist) {
          const alpha = (1 - dist / CONFIG.linkDist) * CONFIG.linkAlpha
          ctx.globalAlpha = alpha
          ctx.beginPath()
          ctx.moveTo(particles[i].x, particles[i].y)
          ctx.lineTo(particles[j].x, particles[j].y)
          ctx.stroke()
        }
      }
    }
    ctx.globalAlpha = 1
  }

  raf = requestAnimationFrame(draw)
}

function syncRuntime() {
  if (canRun()) {
    bindListeners()
    startLoop()
  } else {
    stopLoop()
    unbindListeners()
  }
}

watch(
  () => [props.active, props.intensity],
  () => {
    if (canRun()) {
      syncParticleCount()
      startLoop()
    } else {
      stopLoop()
      unbindListeners()
    }
  },
)

onMounted(() => {
  try {
    motionMq = window.matchMedia('(prefers-reduced-motion: reduce)')
    motionMq.addEventListener?.('change', syncRuntime)
    motionMq.addListener?.(syncRuntime)
  } catch {
    /* ignore */
  }
  resize()
  initParticles()
  syncRuntime()
})

onUnmounted(() => {
  stopLoop()
  unbindListeners()
  try {
    motionMq?.removeEventListener?.('change', syncRuntime)
    motionMq?.removeListener?.(syncRuntime)
  } catch {
    /* ignore */
  }
  motionMq = null
})
</script>

<template>
  <canvas
    ref="canvasRef"
    class="particle-canvas"
    :class="{ active }"
    aria-hidden="true"
  />
</template>

<style scoped>
.particle-canvas {
  position: fixed;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  opacity: 0;
  transition: opacity 1.8s cubic-bezier(0.22, 1, 0.36, 1);
}

.particle-canvas.active {
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .particle-canvas {
    display: none;
  }
}
</style>

