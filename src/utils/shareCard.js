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
    /** 隐私模式：隐藏城市 + 坐标（等同 hidePlace + 无 lat/lon） */
    privacy = false,
    brand = '火柴',
    unit = '根 / 时',
    modeLabel = '',
    foot = '此刻空气 ≈ 火柴燃烧',
    lat = null,
    lon = null,
    issue = '',
  } = data

  const showPlace = Boolean(place) && !hidePlace && !privacy
  const showCoords = !privacy && !hidePlace

  const W = 1080
  const H = ratio === 'square' ? 1080 : 1440
  const isSquare = ratio === 'square'
  const padX = isSquare ? 72 : 80
  const padY = isSquare ? 64 : 72
  const serif = 'Georgia, "Iowan Old Style", "Songti SC", "Noto Serif SC", serif'
  const sans = 'system-ui, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
  const mono = 'ui-monospace, "Cascadia Mono", Menlo, Consolas, monospace'

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  // 底：微暖纸感
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#fbfaf8')
  bg.addColorStop(0.55, '#fffdfb')
  bg.addColorStop(1, '#fff6ef')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // 极轻颗粒
  ctx.save()
  ctx.globalAlpha = 0.035
  for (let i = 0; i < 1800; i += 1) {
    const x = Math.random() * W
    const y = Math.random() * H
    const s = Math.random() * 1.4
    ctx.fillStyle = Math.random() > 0.5 ? '#000' : '#fff'
    ctx.fillRect(x, y, s, s)
  }
  ctx.restore()

  const cx = W / 2

  // 十字角标
  ctx.fillStyle = 'rgba(0,0,0,0.16)'
  ctx.font = `400 22px ${mono}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillText('+', padX - 8, padY - 8)
  ctx.textAlign = 'right'
  ctx.fillText('+', W - padX + 8, padY - 8)
  ctx.textAlign = 'left'
  ctx.fillText('+', padX - 8, H - padY + 8)
  ctx.textAlign = 'right'
  ctx.fillText('+', W - padX + 8, H - padY + 8)

  // 刊号
  const issueText =
    issue ||
    (() => {
      const d = new Date()
      const start = new Date(d.getFullYear(), 0, 0)
      const day = Math.floor((d - start) / 86400000)
      return `MATCH · VOL. ${d.getFullYear()} · NO. ${String(day).padStart(3, '0')}`
    })()
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(0,0,0,0.28)'
  ctx.font = `500 22px ${mono}`
  ctx.fillText(issueText, cx, padY + 4)

  // 顶部：城市 / 品牌
  const topY = padY + 48
  ctx.textBaseline = 'middle'
  if (showPlace) {
    ctx.textAlign = 'left'
    ctx.fillStyle = '#6e6e6e'
    ctx.font = `italic 500 36px ${serif}`
    ctx.fillText(place, padX, topY)
  }
  ctx.textAlign = 'right'
  ctx.fillStyle = '#b0b0b0'
  ctx.font = `500 28px ${sans}`
  ctx.fillText(brand, W - padX, topY)

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.06)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(padX, topY + 34)
  ctx.lineTo(W - padX, topY + 34)
  ctx.stroke()

  // 火候场景
  const stageY = H * (isSquare ? 0.38 : 0.4)
  const isClean = Number(intensity) <= 0.02 || Number(matchCount) <= 0
  drawFireScene(ctx, cx, stageY, isClean ? 'match' : mode, {
    matchCount: isClean ? 1 : matchCount,
    intensity: isClean ? 0 : intensity,
    clean: isClean,
  })

  // 数字
  const countText = formatMatchCount(matchCount)
  const unitText = unit
  const numY = H * (isSquare ? 0.7 : 0.69)

  ctx.textBaseline = 'alphabetic'
  ctx.font = `600 140px ${sans}`
  const numW = ctx.measureText(countText).width
  ctx.font = `500 32px ${sans}`
  const unitW = ctx.measureText(unitText).width
  const gap = 16
  const rowW = numW + gap + unitW
  const rowX = cx - rowW / 2

  ctx.fillStyle = '#141414'
  ctx.font = `600 140px ${sans}`
  ctx.textAlign = 'left'
  ctx.fillText(countText, rowX, numY)

  ctx.fillStyle = '#8a8a8a'
  ctx.font = `500 32px ${sans}`
  ctx.fillText(unitText, rowX + numW + gap, numY - 18)

  // 模式衬线
  if (modeLabel) {
    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(20,20,20,0.45)'
    ctx.font = `italic 500 34px ${serif}`
    ctx.fillText(modeLabel, cx, numY + 48)
  }

  const meta = []
  if (pm25 != null && Number.isFinite(Number(pm25))) meta.push(`PM2.5  ${Math.round(Number(pm25))}`)
  if (aqi != null && Number.isFinite(Number(aqi))) meta.push(`AQI  ${Math.round(Number(aqi))}`)
  ctx.fillStyle = '#a8a8a8'
  ctx.font = `400 24px ${mono}`
  ctx.textAlign = 'center'
  if (meta.length) ctx.fillText(meta.join('   ·   '), cx, numY + (modeLabel ? 92 : 52))

  // 坐标（隐私模式不绘制）
  const la = Number(lat)
  const lo = Number(lon)
  if (showCoords && Number.isFinite(la) && Number.isFinite(lo)) {
    const ns = la >= 0 ? 'N' : 'S'
    const ew = lo >= 0 ? 'E' : 'W'
    const coord = `${Math.abs(la).toFixed(2)}° ${ns}  ·  ${Math.abs(lo).toFixed(2)}° ${ew}`
    ctx.fillStyle = 'rgba(0,0,0,0.22)'
    ctx.font = `500 20px ${mono}`
    ctx.fillText(coord, cx, H - padY - 42)
  }

  // 底部短评
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(padX + 48, H - padY - 20)
  ctx.lineTo(W - padX - 48, H - padY - 20)
  ctx.stroke()

  ctx.fillStyle = '#9a9a9a'
  ctx.font = `italic 400 28px ${serif}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(foot, cx, H - padY + 8)

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
  const privateShare = Boolean(data.privacy || data.hidePlace)
  const safePlace = privateShare
    ? 'air'
    : String(data.place || 'air')
        .replace(/[^\w一-龥-]+/g, '')
        .slice(0, 24)
  const filename = `match-${safePlace || 'air'}.png`
  const file = new File([blob], filename, { type: 'image/png' })

  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      const placeBit = privateShare ? '' : data.place || ''
      await navigator.share({
        files: [file],
        title: data.brand || 'Match',
        text: `${placeBit} ${formatMatchCount(data.matchCount)} ${data.unit || ''}`.trim(),
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
