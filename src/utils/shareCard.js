/**
 * 极简白底分享卡
 */

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function drawMatch(ctx, x, y, opts = {}) {
  const { scale = 1, rotation = 0, lit = true, flameScale = 1 } = opts
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate((rotation * Math.PI) / 180)
  ctx.scale(scale, scale)

  const stickW = 9
  const stickH = 132
  const grd = ctx.createLinearGradient(0, -stickH, 0, 0)
  grd.addColorStop(0, '#edd4b0')
  grd.addColorStop(0.5, '#c4a07a')
  grd.addColorStop(1, '#8b6240')
  ctx.fillStyle = grd
  roundRect(ctx, -stickW / 2, -stickH, stickW, stickH, 3.5)
  ctx.fill()

  const headY = -stickH + 3
  const headGrd = ctx.createRadialGradient(-1.5, headY - 3, 1, 0, headY, 8)
  headGrd.addColorStop(0, '#4a3224')
  headGrd.addColorStop(1, '#2a1c14')
  ctx.fillStyle = headGrd
  ctx.beginPath()
  ctx.ellipse(0, headY, 7, 8, 0, 0, Math.PI * 2)
  ctx.fill()

  if (lit) {
    const fs = flameScale
    const baseY = headY - 5
    const glow = ctx.createRadialGradient(0, baseY - 8 * fs, 2, 0, baseY, 28 * fs)
    glow.addColorStop(0, 'rgba(255, 150, 60, 0.22)')
    glow.addColorStop(1, 'rgba(255, 150, 60, 0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(0, baseY - 8 * fs, 28 * fs, 0, Math.PI * 2)
    ctx.fill()

    const o = ctx.createRadialGradient(0, baseY - 8 * fs, 1, 0, baseY - 2 * fs, 18 * fs)
    o.addColorStop(0, 'rgba(255, 190, 90, 0.95)')
    o.addColorStop(0.5, 'rgba(255, 110, 30, 0.8)')
    o.addColorStop(1, 'rgba(255, 70, 16, 0)')
    ctx.fillStyle = o
    ctx.beginPath()
    ctx.moveTo(0, baseY - 46 * fs)
    ctx.bezierCurveTo(15 * fs, baseY - 24 * fs, 12 * fs, baseY - 4 * fs, 0, baseY)
    ctx.bezierCurveTo(-12 * fs, baseY - 4 * fs, -15 * fs, baseY - 24 * fs, 0, baseY - 46 * fs)
    ctx.fill()

    const m = ctx.createRadialGradient(0, baseY - 6 * fs, 1, 0, baseY, 10 * fs)
    m.addColorStop(0, '#fff6d8')
    m.addColorStop(0.55, '#ffd27a')
    m.addColorStop(1, 'rgba(255, 122, 40, 0)')
    ctx.fillStyle = m
    ctx.beginPath()
    ctx.moveTo(0, baseY - 30 * fs)
    ctx.bezierCurveTo(8 * fs, baseY - 16 * fs, 7 * fs, baseY - 2 * fs, 0, baseY)
    ctx.bezierCurveTo(-7 * fs, baseY - 2 * fs, -8 * fs, baseY - 16 * fs, 0, baseY - 30 * fs)
    ctx.fill()
  }

  ctx.restore()
}

function drawSoftSmoke(ctx, cx, cy, mode, intensity) {
  const count = mode === 'bonfire' ? 5 : mode === 'cluster' ? 3 : 1
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0.5 : i / (count - 1)
    const x = cx + (t - 0.5) * (mode === 'bonfire' ? 120 : 48)
    const y = cy - 30 - i * 22
    const r = 22 + i * 8 + intensity * 8
    const alpha = (mode === 'bonfire' ? 0.05 : 0.035) + intensity * 0.03
    const g = ctx.createRadialGradient(x, y, 1, x, y, r)
    g.addColorStop(0, `rgba(120, 118, 114, ${alpha})`)
    g.addColorStop(1, 'rgba(120, 118, 114, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawFloor(ctx, cx, cy, mode) {
  const w = mode === 'bonfire' ? 240 : mode === 'cluster' ? 170 : 110
  const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, w / 2)
  g.addColorStop(0, mode === 'bonfire' ? 'rgba(255, 120, 40, 0.08)' : 'rgba(0, 0, 0, 0.05)')
  g.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(cx, cy, w / 2, 11, 0, 0, Math.PI * 2)
  ctx.fill()
}

function formatCount(n) {
  if (!Number.isFinite(Number(n))) return '–'
  const v = Number(n)
  return Number.isInteger(v) ? String(v) : (Math.round(v * 10) / 10).toFixed(1)
}

/**
 * @param {object} data
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderShareCard(data) {
  const {
    place = '',
    matchCount = 0,
    pm25 = null,
    aqi = null,
    mode = 'match',
    intensity = 0.35,
    ratio = 'portrait', // portrait | square
    hidePlace = false,
    brand = '火柴',
    unit = '根 / 时',
    modeLabel = '',
    foot = '此刻空气 ≈ 火柴燃烧',
  } = data

  const W = 1080
  const H = ratio === 'square' ? 1080 : 1440
  const pad = ratio === 'square' ? 80 : 96

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#9a9a9a'
  ctx.font = '500 30px Inter, "Noto Sans SC", system-ui, sans-serif'
  ctx.textAlign = 'left'
  if (place && !hidePlace) ctx.fillText(place, pad, pad + 8)

  ctx.textAlign = 'right'
  ctx.fillStyle = '#cfcfcf'
  ctx.font = '500 28px Inter, "Noto Sans SC", system-ui, sans-serif'
  ctx.fillText(brand, W - pad, pad + 8)

  const cx = W / 2
  const stageY = H * (ratio === 'square' ? 0.4 : 0.42)

  if (mode !== 'match') {
    const ambient = ctx.createRadialGradient(cx, stageY, 10, cx, stageY, mode === 'bonfire' ? 260 : 180)
    ambient.addColorStop(0, `rgba(255, 140, 60, ${mode === 'bonfire' ? 0.08 : 0.04})`)
    ambient.addColorStop(1, 'rgba(255, 140, 60, 0)')
    ctx.fillStyle = ambient
    ctx.beginPath()
    ctx.arc(cx, stageY, mode === 'bonfire' ? 260 : 180, 0, Math.PI * 2)
    ctx.fill()
  }

  drawSoftSmoke(ctx, cx, stageY - 10, mode, intensity)
  drawFloor(ctx, cx, stageY + 78, mode)

  if (mode === 'match') {
    drawMatch(ctx, cx, stageY + 70, { scale: 1.45, lit: true, flameScale: 1.18 })
  } else if (mode === 'cluster') {
    const n = Math.min(6, Math.max(3, Math.ceil(Number(matchCount) || 3)))
    for (let i = 0; i < n; i += 1) {
      const t = n <= 1 ? 0.5 : i / (n - 1)
      const x = cx + (t - 0.5) * 150
      const rot = (t - 0.5) * 30
      const y = stageY + 70 + Math.abs(t - 0.5) * 12
      drawMatch(ctx, x, y, { scale: 1.08, rotation: rot, lit: true, flameScale: 1.05 })
    }
  } else {
    const n = 12
    for (let i = 0; i < n; i += 1) {
      const ring = Math.floor(i / 6)
      const slot = i % 6
      const angle = (slot / 6) * Math.PI * 2 + ring * 0.4
      const radius = 42 + ring * 34
      const x = cx + Math.cos(angle) * radius
      const y = stageY + 78 + Math.sin(angle) * radius * 0.26 + ring * 10
      const rot = (angle * 180) / Math.PI + 90
      drawMatch(ctx, x, y, {
        scale: 0.86,
        rotation: rot,
        lit: true,
        flameScale: 1.15 + intensity * 0.15,
      })
    }
  }

  const countText = formatCount(matchCount)
  const unitText = unit
  const numY = H * (ratio === 'square' ? 0.74 : 0.72)

  ctx.textBaseline = 'alphabetic'
  ctx.font = '600 120px "JetBrains Mono", ui-monospace, monospace'
  const numW = ctx.measureText(countText).width
  ctx.font = '500 30px Inter, "Noto Sans SC", system-ui, sans-serif'
  const unitW = ctx.measureText(unitText).width
  const gap = 18
  const rowW = numW + gap + unitW
  const rowX = cx - rowW / 2

  ctx.fillStyle = '#111111'
  ctx.font = '600 120px "JetBrains Mono", ui-monospace, monospace'
  ctx.textAlign = 'left'
  ctx.fillText(countText, rowX, numY)

  ctx.fillStyle = '#9a9a9a'
  ctx.font = '500 30px Inter, "Noto Sans SC", system-ui, sans-serif'
  ctx.fillText(unitText, rowX + numW + gap, numY - 14)

  const meta = []
  if (pm25 != null && Number.isFinite(Number(pm25))) meta.push(`PM2.5  ${Math.round(Number(pm25))}`)
  else if (aqi != null && Number.isFinite(Number(aqi))) meta.push(`AQI  ${Math.round(Number(aqi))}`)
  if (modeLabel) meta.push(modeLabel)

  ctx.fillStyle = '#c2c2c2'
  ctx.font = '400 24px Inter, "Noto Sans SC", system-ui, sans-serif'
  ctx.textAlign = 'center'
  if (meta.length) ctx.fillText(meta.join('    ·    '), cx, numY + 48)

  ctx.fillStyle = '#d4d4d4'
  ctx.font = '400 22px Inter, "Noto Sans SC", system-ui, sans-serif'
  ctx.fillText(foot, cx, H - pad)

  return canvas
}

export async function canvasToBlob(canvas, type = 'image/png', quality = 0.92) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('toBlob failed'))
      },
      type,
      quality,
    )
  })
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

export async function blobFromCard(data) {
  let canvas = null
  try {
    canvas = await renderShareCard(data)
    return await canvasToBlob(canvas)
  } finally {
    if (canvas) {
      canvas.width = 0
      canvas.height = 0
    }
  }
}

export async function shareOrDownloadCard(data) {
  const blob = await blobFromCard(data)
  const safePlace = String(data.place || 'air')
    .replace(/[^\w一-龥-]+/g, '')
    .slice(0, 24)
  const filename = `match-${safePlace || 'air'}.png`
  const file = new File([blob], filename, { type: 'image/png' })

  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: data.brand || 'Match',
        text: `${data.hidePlace ? '' : data.place || ''} ${formatCount(data.matchCount)} ${data.unit || ''}`.trim(),
      })
      return { method: 'share' }
    }
  } catch (e) {
    if (e && (e.name === 'AbortError' || e.name === 'NotAllowedError')) {
      return { method: 'cancelled' }
    }
  }

  downloadBlob(blob, filename)
  return { method: 'download' }
}

export { formatCount }
