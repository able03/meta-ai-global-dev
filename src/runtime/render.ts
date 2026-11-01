// Paints the engine's characters onto a canvas.

import type { Engine } from './engine'

export function render(ctx: CanvasRenderingContext2D, engine: Engine | null, background: string, grid: string): void {
  const { width, height } = ctx.canvas
  ctx.fillStyle = background
  ctx.fillRect(0, 0, width, height)
  ctx.strokeStyle = grid
  ctx.lineWidth = 1
  for (let x = 50; x < width; x += 50) line(ctx, x, 0, x, height)
  for (let y = 50; y < height; y += 50) line(ctx, 0, y, width, y)
  if (!engine) return

  for (const t of engine.things) {
    if (!t.alive || !t.visible) continue
    if (t.emoji) {
      ctx.font = `${t.size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`
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
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
}
