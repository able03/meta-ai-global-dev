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
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export function Scribble({ mood, moodKey, line, onPoke }: Props) {
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

  return (
    <div className={`scribble${loaded ? ' in' : ''}`} aria-live="polite">
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
      {loaded && onPoke && <button className="scribble-poke" onClick={onPoke} aria-label="Say hi to Scribble" />}
    </div>
  )
}
