/**
 * Web Audio 擦燃音效
 * - 短 buffer，用完即丢，避免长驻内存
 * - 燃烧过程默认静音
 */

let ctx = null
let master = null
let enabled = true
let unlocked = false

function ensureContext() {
  if (ctx) return ctx
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  ctx = new AC()
  master = ctx.createGain()
  master.gain.value = enabled ? 0.55 : 0
  master.connect(ctx.destination)
  return ctx
}

export function isSoundEnabled() {
  return enabled
}

export function setSoundEnabled(next) {
  enabled = Boolean(next)
  try {
    localStorage.setItem('pm25-sound', enabled ? '1' : '0')
  } catch {
    /* ignore */
  }
  const c = ensureContext()
  if (c && master) {
    master.gain.cancelScheduledValues(c.currentTime)
    master.gain.linearRampToValueAtTime(enabled ? 0.55 : 0, c.currentTime + 0.12)
  }
  return enabled
}

export function loadSoundPreference() {
  try {
    const v = localStorage.getItem('pm25-sound')
    if (v === '0') enabled = false
    if (v === '1') enabled = true
  } catch {
    /* ignore */
  }
  return enabled
}

export async function unlockAudio() {
  const c = ensureContext()
  if (!c) return false
  if (c.state === 'suspended') {
    try {
      await c.resume()
    } catch {
      return false
    }
  }
  unlocked = true
  return true
}

/** 生成极短噪声，调用方用完即释放引用 */
function makeNoise(seconds, shape = 'pink') {
  const c = ensureContext()
  const len = Math.max(1, Math.floor(c.sampleRate * seconds))
  const buffer = c.createBuffer(1, len, c.sampleRate)
  const data = buffer.getChannelData(0)
  let last = 0
  for (let i = 0; i < len; i += 1) {
    const white = Math.random() * 2 - 1
    if (shape === 'pink') {
      last = 0.98 * last + 0.02 * white
      data[i] = (white + last) * 0.5
    } else {
      data[i] = white
    }
  }
  return buffer
}

export async function playStrike() {
  if (!enabled) return
  await unlockAudio()
  const c = ensureContext()
  if (!c || !master) return
  const t = c.currentTime

  const scrape = c.createBufferSource()
  scrape.buffer = makeNoise(0.16, 'pink')
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 1400
  bp.Q.value = 1.1
  const sg = c.createGain()
  sg.gain.setValueAtTime(0.0001, t)
  sg.gain.exponentialRampToValueAtTime(0.16, t + 0.015)
  sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.15)
  scrape.connect(bp)
  bp.connect(sg)
  sg.connect(master)
  scrape.start(t)
  scrape.stop(t + 0.16)
  scrape.onended = () => {
    try {
      scrape.disconnect()
      bp.disconnect()
      sg.disconnect()
    } catch {
      /* ignore */
    }
  }

  const whoosh = c.createOscillator()
  const wg = c.createGain()
  whoosh.type = 'sine'
  whoosh.frequency.setValueAtTime(240, t + 0.07)
  whoosh.frequency.exponentialRampToValueAtTime(90, t + 0.26)
  wg.gain.setValueAtTime(0.0001, t + 0.07)
  wg.gain.exponentialRampToValueAtTime(0.07, t + 0.09)
  wg.gain.exponentialRampToValueAtTime(0.0001, t + 0.28)
  whoosh.connect(wg)
  wg.connect(master)
  whoosh.start(t + 0.07)
  whoosh.stop(t + 0.3)
  whoosh.onended = () => {
    try {
      whoosh.disconnect()
      wg.disconnect()
    } catch {
      /* ignore */
    }
  }
}

export async function startCrackle() {
  /* 燃烧静音 */
}

export function setCrackleIntensity() {
  /* no-op */
}

export function stopCrackle() {
  /* no-op */
}

export function isAudioUnlocked() {
  return unlocked
}

/** 页面卸载时释放 AudioContext */
export function disposeAudio() {
  try {
    if (ctx) {
      ctx.close?.()
    }
  } catch {
    /* ignore */
  }
  ctx = null
  master = null
  unlocked = false
}
