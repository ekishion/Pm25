/** 缓动与数值动画工具 */

export function easeOutCubic(t) {
  return 1 - (1 - t) ** 3
}

export function easeOutQuint(t) {
  return 1 - (1 - t) ** 5
}

export function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/**
 * 将 value 从 from 动画到 to
 * @returns cancel function
 */
export function animateNumber({
  from = 0,
  to = 0,
  duration = 1400,
  easing = easeOutCubic,
  onUpdate,
  onComplete,
}) {
  if (prefersReducedMotion() || duration <= 0) {
    onUpdate?.(to, 1)
    onComplete?.(to)
    return () => {}
  }

  let raf = 0
  const start = performance.now()
  const delta = to - from

  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration)
    const v = from + delta * easing(t)
    onUpdate?.(v, t)
    if (t < 1) {
      raf = requestAnimationFrame(tick)
    } else {
      onUpdate?.(to, 1)
      onComplete?.(to)
    }
  }

  raf = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(raf)
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}
