/**
 * 分享卡：构图 + 文案；火候绘制复用 drawFire
 */

import { formatMatchCount } from './aqi'
import { drawFireScene } from './drawFire'

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
  const isSquare = ratio === 'square'
  const padX = isSquare ? 72 : 80
  const padY = isSquare ? 64 : 72

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  // 底：微暖白
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#ffffff')
  bg.addColorStop(0.55, '#fffdfb')
  bg.addColorStop(1, '#fff8f2')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  const cx = W / 2

  // ── 顶部信息带 ──
  const topY = padY + 8
  ctx.textBaseline = 'middle'
  ctx.font = '500 34px Inter, "Noto Sans SC", system-ui, sans-serif'

  if (place && !hidePlace) {
    ctx.textAlign = 'left'
    ctx.fillStyle = '#8a8a8a'
    ctx.fillText(place, padX, topY)
  }

  ctx.textAlign = 'right'
  ctx.fillStyle = '#c8c8c8'
  ctx.fillText(brand, W - padX, topY)

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.045)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(padX, topY + 36)
  ctx.lineTo(W - padX, topY + 36)
  ctx.stroke()

  // ── 火候场景 ──
  const stageY = H * (isSquare ? 0.38 : 0.4)
  const isClean = Number(intensity) <= 0.02 || Number(matchCount) <= 0
  drawFireScene(ctx, cx, stageY, isClean ? 'match' : mode, {
    matchCount: isClean ? 1 : matchCount,
    intensity: isClean ? 0 : intensity,
    clean: isClean,
  })

  // ── 数字读数 ──
  const countText = formatMatchCount(matchCount)
  const unitText = unit
  const numY = H * (isSquare ? 0.7 : 0.69)

  ctx.textBaseline = 'alphabetic'
  ctx.font = '600 132px "JetBrains Mono", ui-monospace, monospace'
  const numW = ctx.measureText(countText).width
  ctx.font = '500 34px Inter, "Noto Sans SC", system-ui, sans-serif'
  const unitW = ctx.measureText(unitText).width
  const gap = 16
  const rowW = numW + gap + unitW
  const rowX = cx - rowW / 2

  ctx.fillStyle = '#111111'
  ctx.font = '600 132px "JetBrains Mono", ui-monospace, monospace'
  ctx.textAlign = 'left'
  ctx.fillText(countText, rowX, numY)

  ctx.fillStyle = '#9a9a9a'
  ctx.font = '500 34px Inter, "Noto Sans SC", system-ui, sans-serif'
  ctx.fillText(unitText, rowX + numW + gap, numY - 16)

  const meta = []
  if (pm25 != null && Number.isFinite(Number(pm25))) meta.push(`PM2.5  ${Math.round(Number(pm25))}`)
  else if (aqi != null && Number.isFinite(Number(aqi))) meta.push(`AQI  ${Math.round(Number(aqi))}`)
  if (modeLabel) meta.push(modeLabel)

  ctx.fillStyle = '#b0b0b0'
  ctx.font = '400 28px Inter, "Noto Sans SC", system-ui, sans-serif'
  ctx.textAlign = 'center'
  if (meta.length) ctx.fillText(meta.join('   ·   '), cx, numY + 52)

  // ── 底部 ──
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.045)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(padX + 40, H - padY - 28)
  ctx.lineTo(W - padX - 40, H - padY - 28)
  ctx.stroke()

  ctx.fillStyle = '#b8b8b8'
  ctx.font = '400 26px Inter, "Noto Sans SC", system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(foot, cx, H - padY + 4)

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
        text: `${data.hidePlace ? '' : data.place || ''} ${formatMatchCount(data.matchCount)} ${data.unit || ''}`.trim(),
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

export { formatMatchCount }
