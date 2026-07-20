/**
 * Web Audio 擦燃音效
 * - 短 buffer，用完即丢，避免长驻内存
 * - 燃烧过程默认静音
 */

let ctx = null
let master = null
let enabled = true
let unlocked = false

/** 主音量：偏响但仍留一点防削峰余量 */
const MASTER_GAIN = 0.95

function ensureContext() {
  if (ctx) return ctx
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  ctx = new AC()
  master = ctx.createGain()
  master.gain.value = enabled ? MASTER_GAIN : 0
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
    master.gain.linearRampToValueAtTime(enabled ? MASTER_GAIN : 0, c.currentTime + 0.12)
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
  const len = Math.max(1, Math.round(c.sampleRate * seconds))
  const buffer = c.createBuffer(1, len, c.sampleRate)
  const data = buffer.getChannelData(0)
  let b0 = 0
  let b1 = 0
  let b2 = 0
  let last = 0
  for (let i = 0; i < len; i += 1) {
    const white = Math.random() * 2 - 1
    if (shape === 'pink') {
      // 简易粉红噪声，中低频更饱满，听感更响
      b0 = 0.99886 * b0 + white * 0.0555179
      b1 = 0.99332 * b1 + white * 0.0750759
      b2 = 0.969 * b2 + white * 0.153852
      last = b0 + b1 + b2 + white * 0.18
      data[i] = Math.max(-1, Math.min(1, last * 0.55))
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

  // 1) 摩擦擦燃（主音）
  const scrape = c.createBufferSource()
  scrape.buffer = makeNoise(0.2, 'pink')
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.setValueAtTime(1800, t)
  bp.frequency.exponentialRampToValueAtTime(900, t + 0.16)
  bp.Q.value = 0.85
  const high = c.createBiquadFilter()
  high.type = 'highshelf'
  high.frequency.value = 2200
  high.gain.value = 4
  const sg = c.createGain()
  sg.gain.setValueAtTime(0.0001, t)
  sg.gain.exponentialRampToValueAtTime(0.72, t + 0.012)
  sg.gain.exponentialRampToValueAtTime(0.38, t + 0.05)
  sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.19)
  scrape.connect(bp)
  bp.connect(high)
  high.connect(sg)
  sg.connect(master)
  scrape.start(t)
  scrape.stop(t + 0.2)
  scrape.onended = () => {
    try {
      scrape.disconnect()
      bp.disconnect()
      high.disconnect()
      sg.disconnect()
    } catch {
      /* ignore */
    }
  }

  // 2) 点燃“噗”一声（低频冲击，增加存在感）
  const pop = c.createOscillator()
  const pg = c.createGain()
  pop.type = 'triangle'
  pop.frequency.setValueAtTime(320, t + 0.04)
  pop.frequency.exponentialRampToValueAtTime(70, t + 0.18)
  pg.gain.setValueAtTime(0.0001, t + 0.04)
  pg.gain.exponentialRampToValueAtTime(0.42, t + 0.055)
  pg.gain.exponentialRampToValueAtTime(0.0001, t + 0.2)
  pop.connect(pg)
  pg.connect(master)
  pop.start(t + 0.04)
  pop.stop(t + 0.22)
  pop.onended = () => {
    try {
      pop.disconnect()
      pg.disconnect()
    } catch {
      /* ignore */
    }
  }

  // 3) 尾音 whoosh
  const whoosh = c.createOscillator()
  const wg = c.createGain()
  whoosh.type = 'sine'
  whoosh.frequency.setValueAtTime(280, t + 0.08)
  whoosh.frequency.exponentialRampToValueAtTime(85, t + 0.3)
  wg.gain.setValueAtTime(0.0001, t + 0.08)
  wg.gain.exponentialRampToValueAtTime(0.28, t + 0.1)
  wg.gain.exponentialRampToValueAtTime(0.0001, t + 0.32)
  whoosh.connect(wg)
  wg.connect(master)
  whoosh.start(t + 0.08)
  whoosh.stop(t + 0.34)
  whoosh.onended = () => {
    try {
      whoosh.disconnect()
      wg.disconnect()
    } catch {
      /* ignore */
    }
  }

  // 4) 短促火花噪声
  const spark = c.createBufferSource()
  spark.buffer = makeNoise(0.08, 'white')
  const spHp = c.createBiquadFilter()
  spHp.type = 'highpass'
  spHp.frequency.value = 2800
  const spg = c.createGain()
  spg.gain.setValueAtTime(0.0001, t + 0.05)
  spg.gain.exponentialRampToValueAtTime(0.35, t + 0.06)
  spg.gain.exponentialRampToValueAtTime(0.0001, t + 0.12)
  spark.connect(spHp)
  spHp.connect(spg)
  spg.connect(master)
  spark.start(t + 0.05)
  spark.stop(t + 0.13)
  spark.onended = () => {
    try {
      spark.disconnect()
      spHp.disconnect()
      spg.disconnect()
    } catch {
      /* ignore */
    }
  }
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
