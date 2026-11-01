// Scribble, the pencil-kid mascot (made with Meshy: image → 3D → auto-rig → animations).
// Sits on the console and reacts to what's happening: waves hello, scratches its head while
// Meta AI tidies your words, cheers when your game runs, and shrugs when something's wrong.

import { useEffect, useRef, useState } from 'react'

export type Mood = 'hello' | 'idle' | 'thinking' | 'cheer' | 'oops'

const CLIP: Record<Mood, string> = {
  hello: 'Big_Wave_Hello',
  idle: 'Idle',
  thinking: 'Confused_Scratch',
  cheer: 'Cheer_with_Both_Hands_Up',
  oops: 'Shrug',
}

/** Moods that play once and then settle back into idle. */
const ONCE = new Set<Mood>(['hello', 'cheer', 'oops'])

interface ModelViewerElement extends HTMLElement {
  animationName: string
  play(options?: { repetitions?: number; pingpong?: boolean }): void
  pause(): void
  loaded: boolean
}

interface Props {
  mood: Mood
  /** Changes every time a mood is triggered, so the same mood can replay. */
  moodKey: number
  line: string | null
  /** Called when someone clicks or taps Scribble. */
  onPoke?(): void
  /** Called when someone drags Scribble to a new spot and lets go. */
  onDropped?(): void
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export function Scribble({ mood, moodKey, line, onPoke, onDropped }: Props) {
  const ref = useRef<ModelViewerElement>(null)
  const [ready, setReady] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // Load the 3D viewer only after the page is up, so it never slows down the first paint.
  useEffect(() => {
    let cancelled = false
    const start = () =>
      import('@google/model-viewer')
        .then(() => !cancelled && setReady(true))
        .catch(() => {
          /* no WebGL or offline: Scribble just doesn't appear */
        })
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback
    if (idle) idle(start)
    else setTimeout(start, 300)
    return () => {
      cancelled = true
    }
  }, [])

  // Back to idle after a one-shot clip finishes.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onLoad = () => setLoaded(true)
    const onFinished = () => {
      el.animationName = CLIP.idle
      if (!reducedMotion()) el.play()
    }
    el.addEventListener('load', onLoad)
    el.addEventListener('finished', onFinished)
    return () => {
      el.removeEventListener('load', onLoad)
      el.removeEventListener('finished', onFinished)
    }
  }, [ready])

  useEffect(() => {
    const el = ref.current
    if (!el || !loaded) return
    el.animationName = CLIP[mood]
    if (reducedMotion()) {
      el.pause()
      return
    }
    el.play(ONCE.has(mood) ? { repetitions: 1 } : undefined)
  }, [mood, moodKey, loaded])

  // --- Dragging Scribble around the page --------------------------------------
  // A small move is a click (poke); a bigger move picks Scribble up. Where you drop it is remembered.
  const wrap = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(loadPos)
  const [carrying, setCarrying] = useState(false)
  const drag = useRef<{ startX: number; startY: number; dx: number; dy: number; moved: boolean } | null>(null)

  // Keep Scribble on screen when the window is resized.
  useEffect(() => {
    const keepInside = () => setPos((p) => (p ? clampPos(p, wrap.current) : p))
    window.addEventListener('resize', keepInside)
    return () => window.removeEventListener('resize', keepInside)
  }, [])

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const box = wrap.current?.getBoundingClientRect()
    if (!box) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { startX: e.clientX, startY: e.clientY, dx: e.clientX - box.left, dy: e.clientY - box.top, moved: false }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d) return
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 6) return
    if (!d.moved) {
      d.moved = true
      setCarrying(true)
    }
    setPos(clampPos({ x: e.clientX - d.dx, y: e.clientY - d.dy }, wrap.current))
  }

  const onPointerUp = () => {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (d.moved) {
      setCarrying(false)
      setPos((p) => {
        if (p) savePos(p)
        return p
      })
      onDropped?.()
    } else onPoke?.()
  }

  const goHome = () => {
    setPos(null)
    savePos(null)
  }

  const floating = pos !== null
  const bubbleOnRight = floating && pos.x < 260

  return (
    <div
      ref={wrap}
      className={`scribble${loaded ? ' in' : ''}${floating ? ' floating' : ''}${carrying ? ' carrying' : ''}${bubbleOnRight ? ' bubble-right' : ''}`}
      style={floating ? { left: pos.x, top: pos.y } : undefined}
      aria-live="polite"
    >
      {line && loaded && (
        <p key={moodKey} className={`scribble-says ${mood}`}>
          {line}
        </p>
      )}
      {ready && (
        <model-viewer
          ref={ref}
          class="scribble-model"
          src="/mascot/scribble.glb"
          alt="Scribble, a friendly pencil character"
          animation-name={CLIP.idle}
          animation-crossfade-duration="350"
          camera-orbit="0deg 80deg 92%"
          field-of-view="28deg"
          interaction-prompt="none"
          disable-zoom=""
          disable-pan=""
          disable-tap=""
          shadow-intensity="0.7"
          shadow-softness="0.9"
          exposure="1.05"
          environment-image="neutral"
          loading="lazy"
        />
      )}
      {loaded && (
        <button
          className="scribble-poke"
          aria-label="Scribble: click to say hi, drag to move, double-click to send home"
          title="Click to say hi · Drag to move · Double-click to send home"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={goHome}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onPoke?.()
            }
          }}
        />
      )}
    </div>
  )
}

const POS_KEY = 'sayntax.scribble-pos'

function loadPos(): { x: number; y: number } | null {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY) ?? 'null')
    return p && typeof p.x === 'number' && typeof p.y === 'number' ? clampPos(p, null) : null
  } catch {
    return null
  }
}

function savePos(p: { x: number; y: number } | null): void {
  try {
    if (p) localStorage.setItem(POS_KEY, JSON.stringify(p))
    else localStorage.removeItem(POS_KEY)
  } catch {
    /* remembering the spot is only a convenience */
  }
}

function clampPos(p: { x: number; y: number }, el: HTMLElement | null): { x: number; y: number } {
  const w = el?.offsetWidth ?? 92
  const h = el?.offsetHeight ?? 112
  return {
    x: Math.max(0, Math.min(window.innerWidth - w, p.x)),
    y: Math.max(0, Math.min(window.innerHeight - h, p.y)),
  }
}
