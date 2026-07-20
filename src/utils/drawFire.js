/**
 * Canvas 火候绘制原语 —— 火柴 / 火簇 / 篝火 / 烟雾 / 地面
 * 分享卡等静态渲染统一复用，避免样式分叉
 */

import {
  CLUSTER_LAYOUT_CANVAS,
  SCENE_LIMITS,
  clusterSlot,
  bonfireLogsForCanvas,
} from './fireMode'

export function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

/** 尖顶水滴形火苗 */
export function drawFlameShape(ctx, x, y, w, h, colors) {
  const [c0, c1, c2] = colors
  const g = ctx.createRadialGradient(
    x,
    y - h * 0.18,
    h * 0.04,
    x,
    y - h * 0.08,
    Math.max(w, h) * 0.62,
  )
  g.addColorStop(0, c0)
  g.addColorStop(0.42, c1)
  g.addColorStop(1, c2)
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(x, y - h)
  ctx.bezierCurveTo(
    x + w * 0.55,
    y - h * 0.72,
    x + w * 0.95,
    y - h * 0.28,
    x + w * 0.55,
    y - h * 0.06,
  )
  ctx.bezierCurveTo(
    x + w * 0.28,
    y + h * 0.02,
    x - w * 0.28,
    y + h * 0.02,
    x - w * 0.55,
    y - h * 0.06,
  )
  ctx.bezierCurveTo(
    x - w * 0.95,
    y - h * 0.28,
    x - w * 0.55,
    y - h * 0.72,
    x,
    y - h,
  )
  ctx.closePath()
  ctx.fill()
}

/** 三层火苗（外橙 / 中金 / 芯白） */
export function drawLayeredFlame(ctx, x, y, scale = 1) {
  const s = scale
  // 外光晕
  const glow = ctx.createRadialGradient(x, y - 14 * s, 2, x, y, 36 * s)
  glow.addColorStop(0, 'rgba(255, 160, 70, 0.32)')
  glow.addColorStop(0.55, 'rgba(255, 120, 40, 0.1)')
  glow.addColorStop(1, 'rgba(255, 120, 40, 0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(x, y - 12 * s, 36 * s, 0, Math.PI * 2)
  ctx.fill()

  drawFlameShape(ctx, x, y, 20 * s, 56 * s, [
    'rgba(255, 170, 70, 0.98)',
    'rgba(255, 100, 28, 0.88)',
    'rgba(255, 60, 12, 0)',
  ])
  drawFlameShape(ctx, x, y + 1 * s, 12 * s, 40 * s, [
    'rgba(255, 230, 150, 0.98)',
    'rgba(255, 170, 70, 0.9)',
    'rgba(255, 110, 30, 0)',
  ])
  drawFlameShape(ctx, x, y + 3 * s, 6 * s, 22 * s, [
    '#fffdf6',
    '#ffe08a',
    'rgba(255, 200, 100, 0)',
  ])
}

/**
 * 一根写实火柴
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x 杆底中心 x
 * @param {number} y 杆底中心 y
 * @param {{ scale?: number, rotation?: number, lit?: boolean, flameScale?: number, clean?: boolean }} [opts]
 */
export function drawMatch(ctx, x, y, opts = {}) {
  const { scale = 1, rotation = 0, lit = true, flameScale = 1, clean = false } = opts
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate((rotation * Math.PI) / 180)
  ctx.scale(scale, scale)

  const stickW = 12
  const stickH = 168
  const headRx = 9.5
  const headRy = 11
  const headY = -stickH + 2

  // 木杆纵向木质渐变
  const woodY = ctx.createLinearGradient(0, -stickH, 0, 0)
  woodY.addColorStop(0, '#f0d8b4')
  woodY.addColorStop(0.35, '#d4b08a')
  woodY.addColorStop(0.75, '#b8895c')
  woodY.addColorStop(1, '#8b6240')
  ctx.fillStyle = woodY
  roundRect(ctx, -stickW / 2, -stickH + headRy * 0.55, stickW, stickH - headRy * 0.55, 5)
  ctx.fill()

  // 横向明暗 → 圆棍体积
  const woodX = ctx.createLinearGradient(-stickW / 2, 0, stickW / 2, 0)
  woodX.addColorStop(0, 'rgba(70, 40, 18, 0.28)')
  woodX.addColorStop(0.22, 'rgba(255, 255, 255, 0.08)')
  woodX.addColorStop(0.48, 'rgba(255, 255, 255, 0.18)')
  woodX.addColorStop(0.78, 'rgba(255, 255, 255, 0.04)')
  woodX.addColorStop(1, 'rgba(50, 28, 10, 0.32)')
  ctx.fillStyle = woodX
  roundRect(ctx, -stickW / 2, -stickH + headRy * 0.55, stickW, stickH - headRy * 0.55, 5)
  ctx.fill()

  // 杆底收口
  ctx.fillStyle = '#7a5636'
  ctx.beginPath()
  ctx.ellipse(0, -1, stickW * 0.48, 3.2, 0, 0, Math.PI * 2)
  ctx.fill()

  // 药头
  const headGrd = ctx.createRadialGradient(-2.5, headY - 3.5, 1.2, 0, headY + 1, headRx * 1.15)
  if (clean) {
    headGrd.addColorStop(0, '#5a4030')
    headGrd.addColorStop(0.55, '#2a1c14')
    headGrd.addColorStop(1, '#1a100c')
  } else {
    headGrd.addColorStop(0, '#5a3a28')
    headGrd.addColorStop(0.45, '#2e1d14')
    headGrd.addColorStop(1, '#1a100c')
  }
  ctx.fillStyle = headGrd
  ctx.beginPath()
  ctx.ellipse(0, headY, headRx, headRy, 0, 0, Math.PI * 2)
  ctx.fill()

  // 药头高光
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)'
  ctx.beginPath()
  ctx.ellipse(-2.8, headY - 3.2, 3.2, 2.4, -0.4, 0, Math.PI * 2)
  ctx.fill()

  // 药头与木杆衔接
  ctx.strokeStyle = 'rgba(20, 10, 6, 0.35)'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.ellipse(0, headY + headRy * 0.55, headRx * 0.72, 2.2, 0, 0, Math.PI * 2)
  ctx.stroke()

  if (clean) {
    // 极净：药头一点余温
    const glow = ctx.createRadialGradient(0, headY - 4, 1, 0, headY - 2, 14)
    glow.addColorStop(0, 'rgba(255, 150, 70, 0.28)')
    glow.addColorStop(1, 'rgba(255, 120, 40, 0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(0, headY - 3, 14, 0, Math.PI * 2)
    ctx.fill()
    const tip = ctx.createRadialGradient(0, headY - 6, 0.5, 0, headY - 4, 6)
    tip.addColorStop(0, 'rgba(255, 220, 150, 0.55)')
    tip.addColorStop(0.55, 'rgba(255, 120, 40, 0.22)')
    tip.addColorStop(1, 'rgba(255, 100, 30, 0)')
    ctx.fillStyle = tip
    ctx.beginPath()
    ctx.ellipse(0, headY - 5, 5, 7, 0, 0, Math.PI * 2)
    ctx.fill()
  } else if (lit) {
    drawLayeredFlame(ctx, 0, headY - headRy * 0.15, flameScale)
  }

  ctx.restore()
}

/**
 * 水平木柴（底座）
 * @param {{ char?: number }} [opts] char 炭化程度 0–1
 */
export function drawLog(ctx, x, y, w, h, rot = 0, opts = {}) {
  const char = opts.char ?? 0.5
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate((rot * Math.PI) / 180)

  const body = ctx.createLinearGradient(-w / 2, 0, w / 2, 0)
  body.addColorStop(0, '#5a3820')
  body.addColorStop(0.18, '#8b6240')
  body.addColorStop(0.5, '#d4b896')
  body.addColorStop(0.82, '#8b6240')
  body.addColorStop(1, '#5a3820')
  ctx.fillStyle = body
  roundRect(ctx, -w / 2, -h / 2, w, h, Math.min(7, h / 2))
  ctx.fill()

  const charG = ctx.createLinearGradient(0, -h / 2, 0, h / 2)
  charG.addColorStop(0, `rgba(20, 8, 4, ${char * 0.15})`)
  charG.addColorStop(0.55, `rgba(28, 12, 6, ${char * 0.45})`)
  charG.addColorStop(1, `rgba(12, 4, 2, ${char * 0.72})`)
  ctx.fillStyle = charG
  roundRect(ctx, -w / 2, -h / 2, w, h, Math.min(7, h / 2))
  ctx.fill()

  const end = ctx.createRadialGradient(0, -h / 2, 1, 0, -h / 2, w * 0.42)
  end.addColorStop(0, '#d2b090')
  end.addColorStop(0.55, '#a07850')
  end.addColorStop(1, '#5a3820')
  ctx.fillStyle = end
  ctx.beginPath()
  ctx.ellipse(0, -h / 2, w * 0.48, h * 0.42, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()
}

/**
 * 竖向尖顶木柴（teepee 腿）
 * 以杆中心为原点，h 沿 y 轴
 */
export function drawTeepeeLog(ctx, x, y, w, h, rot = 0, opts = {}) {
  const char = opts.char ?? 0.5
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate((rot * Math.PI) / 180)

  const body = ctx.createLinearGradient(-w / 2, 0, w / 2, 0)
  body.addColorStop(0, '#5a3820')
  body.addColorStop(0.22, '#8b6240')
  body.addColorStop(0.5, '#d4b896')
  body.addColorStop(0.78, '#8b6240')
  body.addColorStop(1, '#5a3820')
  ctx.fillStyle = body
  roundRect(ctx, -w / 2, -h / 2, w, h, 6)
  ctx.fill()

  const charG = ctx.createLinearGradient(0, -h / 2, 0, h / 2)
  charG.addColorStop(0, 'rgba(20, 8, 4, 0.05)')
  charG.addColorStop(0.45, `rgba(28, 12, 6, ${char * 0.55})`)
  charG.addColorStop(1, `rgba(12, 4, 2, ${char * 0.85})`)
  ctx.fillStyle = charG
  roundRect(ctx, -w / 2, -h / 2, w, h, 6)
  ctx.fill()

  const end = ctx.createRadialGradient(0, -h / 2, 1, 0, -h / 2, w * 0.45)
  end.addColorStop(0, '#d2b090')
  end.addColorStop(0.55, '#a07850')
  end.addColorStop(1, '#5a3820')
  ctx.fillStyle = end
  ctx.beginPath()
  ctx.ellipse(0, -h / 2, w * 0.48, 7, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()
}

/** 经典篝火：底柴 + 尖顶 + 炭火 + 多层火焰 */
export function drawBonfire(ctx, cx, cy, intensity = 0.4) {
  const i = Math.min(1, Math.max(0.2, intensity))
  const s = 1.05 + i * 0.25

  // 地面暖光
  const floor = ctx.createRadialGradient(cx, cy + 8, 4, cx, cy + 8, 170 * s)
  floor.addColorStop(0, `rgba(255, 130, 40, ${0.16 + i * 0.1})`)
  floor.addColorStop(0.45, `rgba(255, 110, 30, ${0.06 + i * 0.04})`)
  floor.addColorStop(1, 'rgba(255, 110, 30, 0)')
  ctx.fillStyle = floor
  ctx.beginPath()
  ctx.ellipse(cx, cy + 10, 170 * s, 28, 0, 0, Math.PI * 2)
  ctx.fill()

  // 灰烬
  const ash = ctx.createRadialGradient(cx, cy + 14, 2, cx, cy + 14, 70)
  ash.addColorStop(0, 'rgba(48, 32, 22, 0.22)')
  ash.addColorStop(1, 'rgba(48, 32, 22, 0)')
  ctx.fillStyle = ash
  ctx.beginPath()
  ctx.ellipse(cx, cy + 14, 70, 12, 0, 0, Math.PI * 2)
  ctx.fill()

  // 木柴布局与 DOM 篝火共用 BONFIRE_LOGS（DOM 底锚点 → Canvas 中心）
  const logs = bonfireLogsForCanvas(1.28)
  for (const log of logs) {
    if (log.kind === 'base') {
      drawLog(ctx, cx + log.x, cy + log.y - log.h / 2, log.w, log.h, log.rot, {
        char: log.char,
      })
    } else {
      drawTeepeeLog(ctx, cx + log.x, cy + log.y - log.h / 2, log.w, log.h, log.rot, {
        char: log.char,
      })
    }
  }

  // 炭火
  const coals = ctx.createRadialGradient(cx, cy + 2, 2, cx, cy + 2, 52)
  coals.addColorStop(0, `rgba(255, 170, 70, ${0.85 + i * 0.1})`)
  coals.addColorStop(0.4, `rgba(255, 100, 28, ${0.55 + i * 0.15})`)
  coals.addColorStop(0.75, 'rgba(140, 36, 8, 0.28)')
  coals.addColorStop(1, 'rgba(140, 36, 8, 0)')
  ctx.fillStyle = coals
  ctx.beginPath()
  ctx.ellipse(cx, cy + 2, 52, 16, 0, 0, Math.PI * 2)
  ctx.fill()

  // 多层火焰
  const flameBaseY = cy - 4
  const scale = 1.15 + i * 0.35

  ctx.save()
  ctx.globalAlpha = 0.45
  drawFlameShape(ctx, cx, flameBaseY, 70 * scale, 108 * scale, [
    'rgba(255, 120, 30, 0.7)',
    'rgba(255, 70, 16, 0.35)',
    'rgba(255, 50, 10, 0)',
  ])
  ctx.restore()

  drawFlameShape(ctx, cx - 34 * scale, flameBaseY + 6, 34 * scale, 92 * scale, [
    'rgba(255, 190, 90, 0.9)',
    'rgba(255, 110, 28, 0.75)',
    'rgba(255, 60, 12, 0)',
  ])
  drawFlameShape(ctx, cx + 32 * scale, flameBaseY + 8, 32 * scale, 86 * scale, [
    'rgba(255, 190, 90, 0.88)',
    'rgba(255, 110, 28, 0.72)',
    'rgba(255, 60, 12, 0)',
  ])

  drawFlameShape(ctx, cx, flameBaseY, 52 * scale, 128 * scale, [
    'rgba(255, 200, 100, 0.98)',
    'rgba(255, 118, 30, 0.9)',
    'rgba(255, 56, 10, 0)',
  ])
  drawFlameShape(ctx, cx, flameBaseY, 30 * scale, 96 * scale, [
    '#fff8e4',
    '#ffd27a',
    'rgba(255, 130, 40, 0)',
  ])
  drawFlameShape(ctx, cx, flameBaseY + 4, 14 * scale, 52 * scale, [
    '#ffffff',
    '#ffe9a8',
    'rgba(255, 210, 120, 0)',
  ])

  // 火星
  const embers = [
    [-18, -88],
    [12, -110],
    [-6, -132],
    [28, -96],
    [-30, -70],
    [8, -148],
  ]
  for (let e = 0; e < embers.length; e += 1) {
    const [ex, ey] = embers[e]
    const r = 2.2 + (e % 3) * 0.7
    const px = cx + ex * scale
    const py = flameBaseY + ey * scale
    const eg = ctx.createRadialGradient(px, py, 0.5, px, py, r * 2.2)
    eg.addColorStop(0, 'rgba(255, 230, 160, 0.95)')
    eg.addColorStop(0.5, 'rgba(255, 140, 40, 0.7)')
    eg.addColorStop(1, 'rgba(255, 100, 20, 0)')
    ctx.fillStyle = eg
    ctx.beginPath()
    ctx.arc(px, py, r * 2.2, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** 一簇扇形火柴 */
export function drawMatchCluster(ctx, cx, cy, matchCount = 4, intensity = 0.35) {
  const n = Math.min(
    SCENE_LIMITS.clusterMax,
    Math.max(SCENE_LIMITS.clusterMin, Math.ceil(Number(matchCount) || 3)),
  )
  const { spread, maxRot, lift, scale } = CLUSTER_LAYOUT_CANVAS
  for (let i = 0; i < n; i += 1) {
    const slot = clusterSlot(i, n)
    drawMatch(ctx, cx + slot.nx * spread, cy + slot.nlift * lift, {
      scale,
      rotation: slot.nrot * maxRot,
      lit: true,
      flameScale: 1.08 + intensity * 0.1,
    })
  }
}

/** 轻烟雾 */
export function drawSoftSmoke(ctx, cx, cy, mode = 'match', intensity = 0.35) {
  const count = mode === 'bonfire' ? 6 : mode === 'cluster' ? 4 : 2
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0.5 : i / (count - 1)
    const spread = mode === 'bonfire' ? 140 : mode === 'cluster' ? 70 : 36
    const x = cx + (t - 0.5) * spread + (i % 2 === 0 ? -8 : 10)
    const y = cy - 20 - i * 26
    const r = (mode === 'bonfire' ? 28 : 20) + i * 9 + intensity * 10
    const alpha = (mode === 'bonfire' ? 0.055 : 0.04) + intensity * 0.03
    const g = ctx.createRadialGradient(x, y, 1, x, y, r)
    g.addColorStop(0, `rgba(110, 108, 104, ${alpha})`)
    g.addColorStop(1, 'rgba(110, 108, 104, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** 地面阴影 / 暖光 */
export function drawFloor(ctx, cx, cy, mode = 'match') {
  const w = mode === 'bonfire' ? 280 : mode === 'cluster' ? 200 : 120
  const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, w / 2)
  g.addColorStop(0, mode === 'bonfire' ? 'rgba(255, 120, 40, 0.1)' : 'rgba(0, 0, 0, 0.055)')
  g.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(cx, cy, w / 2, 14, 0, 0, Math.PI * 2)
  ctx.fill()
}

/** 场景暖色环境光 */
export function drawAmbientGlow(ctx, cx, cy, mode = 'match') {
  const ambientR = mode === 'bonfire' ? 300 : mode === 'cluster' ? 220 : 160
  const ambientA = mode === 'bonfire' ? 0.12 : mode === 'cluster' ? 0.07 : 0.04
  const ambient = ctx.createRadialGradient(cx, cy, 8, cx, cy, ambientR)
  ambient.addColorStop(0, `rgba(255, 140, 55, ${ambientA})`)
  ambient.addColorStop(0.55, `rgba(255, 150, 70, ${ambientA * 0.35})`)
  ambient.addColorStop(1, 'rgba(255, 140, 55, 0)')
  ctx.fillStyle = ambient
  ctx.beginPath()
  ctx.arc(cx, cy, ambientR, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * 按 mode 画完整火候场景（烟雾 + 地面 + 主体）
 * @param {'match'|'cluster'|'bonfire'} mode
 */
export function drawFireScene(ctx, cx, cy, mode = 'match', opts = {}) {
  const { matchCount = 1, intensity = 0.35, clean = false } = opts
  if (clean) {
    // 极轻烟 + 无暖光洪流
    drawSoftSmoke(ctx, cx, cy - 20, 'match', 0.08)
    drawFloor(ctx, cx, cy + 96, 'match')
    drawMatch(ctx, cx, cy + 96, { scale: 1.55, lit: false, clean: true })
    return
  }
  drawAmbientGlow(ctx, cx, cy, mode)
  drawSoftSmoke(ctx, cx, cy - 28, mode, intensity)
  drawFloor(ctx, cx, cy + (mode === 'bonfire' ? 62 : 96), mode)

  if (mode === 'bonfire') {
    drawBonfire(ctx, cx, cy + 48, intensity)
  } else if (mode === 'cluster') {
    drawMatchCluster(ctx, cx, cy + 96, matchCount, intensity)
  } else {
    drawMatch(ctx, cx, cy + 96, { scale: 1.55, lit: true, flameScale: 1.18 })
  }
}
