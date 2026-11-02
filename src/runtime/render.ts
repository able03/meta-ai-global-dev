// Paints the engine's world onto a canvas: background, characters, speech bubbles and on-screen text.

import type { Engine } from './engine'
import { spriteCanvas } from '../lang/characters'

const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'
const HAND_FONT = '"Patrick Hand", "Comic Sans MS", cursive'
const INK = '#23305e'

export function render(ctx: CanvasRenderingContext2D, engine: Engine | null, background: string, grid: string): void {
  const { width, height } = ctx.canvas
  ctx.fillStyle = engine?.background.color ?? background
  ctx.fillRect(0, 0, width, height)

  if (engine?.background.emoji) {
    // A faint pattern of the emoji, like wallpaper: grass, stars, waves…
    ctx.save()
    ctx.globalAlpha = 0.18
    ctx.font = `34px ${EMOJI_FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let y = 30; y < height; y += 70) {
      for (let x = (y / 70) % 2 ? 70 : 30; x < width; x += 80) ctx.fillText(engine.background.emoji, x, y)
    }
    ctx.restore()
  } else if (!engine?.background.color) {
    ctx.strokeStyle = grid
    ctx.lineWidth = 1
    for (let x = 50; x < width; x += 50) line(ctx, x, 0, x, height)
    for (let y = 50; y < height; y += 50) line(ctx, 0, y, width, y)
  }
  if (!engine) return

  for (const t of engine.things) {
    if (!t.alive || !t.visible) continue
    const pixels = t.sprite ? spriteCanvas(t.sprite) : null
    if (pixels) {
      // Crisp, chunky pixels; turned around to face the way it's moving.
      ctx.save()
      ctx.imageSmoothingEnabled = false
      ctx.translate(t.x, t.y)
      ctx.scale(t.facing, 1)
      ctx.drawImage(pixels, -t.size / 2, -t.size / 2, t.size, t.size)
      ctx.restore()
      continue
    }
    if (t.emoji) {
      ctx.font = `${t.size}px ${EMOJI_FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(t.emoji, t.x, t.y + t.size * 0.05)
      continue
    }
    ctx.fillStyle = t.color
    const r = t.size / 2
    ctx.beginPath()
    if (t.shape === 'square') ctx.rect(t.x - r, t.y - r, t.size, t.size)
    else if (t.shape === 'triangle') {
      ctx.moveTo(t.x, t.y - r)
      ctx.lineTo(t.x + r, t.y + r)
      ctx.lineTo(t.x - r, t.y + r)
      ctx.closePath()
    } else ctx.arc(t.x, t.y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  for (const t of engine.things) {
    if (t.alive && t.visible && t.bubble) bubble(ctx, t.bubble.text, t.x, t.y - t.size / 2 - 10, width)
  }

  for (const l of engine.labelTexts()) {
    ctx.font = `26px ${HAND_FONT}`
    ctx.textAlign = l.align
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 6
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.strokeText(l.text, l.x, l.y)
    ctx.fillStyle = INK
    ctx.fillText(l.text, l.x, l.y)
  }
}

function bubble(ctx: CanvasRenderingContext2D, text: string, x: number, bottom: number, stageWidth: number) {
  ctx.font = `20px ${HAND_FONT}`
  const w = Math.min(300, ctx.measureText(text).width + 24)
  const h = 34
  const left = Math.max(6, Math.min(stageWidth - w - 6, x - w / 2))
  const top = Math.max(6, bottom - h)
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = INK
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.roundRect(left, top, w, h, 12)
  ctx.fill()
  ctx.stroke()
  // little tail pointing at the speaker
  const tx = Math.max(left + 12, Math.min(left + w - 12, x))
  ctx.beginPath()
  ctx.moveTo(tx - 7, top + h - 1)
  ctx.lineTo(tx, top + h + 9)
  ctx.lineTo(tx + 7, top + h - 1)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(tx - 7, top + h)
  ctx.lineTo(tx, top + h + 9)
  ctx.lineTo(tx + 7, top + h)
  ctx.stroke()
  ctx.fillStyle = INK
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, left + w / 2, top + h / 2 + 1, w - 16)
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
}
