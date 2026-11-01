import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { StepsEditor } from './components/StepsEditor'
import { STAGE } from './lang/ast'
import { parse } from './lang/parser'
import { autocorrect, cacheKey, changedLines, messyLines } from './lang/tidy'
import { Engine } from './runtime/engine'
import { render } from './runtime/render'

interface Tidied {
  steps: string
  assumptions: string[]
}

const EXAMPLES = import.meta.glob('../examples/*.say', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const exampleName = (path: string) => path.split('/').pop()!.replace('.say', '').replace(/-/g, ' ')

const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(`sayntax.${key}`)
    } catch {
      return null
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(`sayntax.${key}`, value)
    } catch {
      /* storage unavailable — saving is a convenience only */
    }
  },
}

/** Answers the AI already gave on this device, so the same words never cost a second call. */
const localCache = {
  read(): Record<string, Tidied> {
    try {
      return JSON.parse(store.get('cache') ?? '{}')
    } catch {
      return {}
    }
  },
  get(key: string): Tidied | null {
    return this.read()[key] ?? null
  },
  set(key: string, value: Tidied) {
    const all = this.read()
    all[key] = value
    const keys = Object.keys(all)
    for (const old of keys.slice(0, Math.max(0, keys.length - 200))) delete all[old]
    store.set('cache', JSON.stringify(all))
  },
}

const KEY_MAP: Record<string, string> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', ' ': 'space', Enter: 'enter' }
const toKey = (e: KeyboardEvent) => KEY_MAP[e.key] ?? (e.key.length === 1 ? e.key.toLowerCase() : null)

const STARTER = 'a red ball that bounces around the screen'

export function App() {
  const [steps, setSteps] = useState(() => store.get('steps') ?? STARTER)
  const [glow, setGlow] = useState<Set<number>>(new Set())
  const [assumptions, setAssumptions] = useState<string[]>([])
  const [code, setCode] = useState(() => store.get('code') ?? '')
  const [codeInput, setCodeInput] = useState('')
  const [showCode, setShowCode] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const [running, setRunning] = useState(false)
  const [output, setOutput] = useState<string[]>([])
  const [question, setQuestion] = useState<string | null>(null)
  const [answer, setAnswer] = useState('')
  const [runError, setRunError] = useState<{ line: number; message: string } | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<Engine | null>(null)
  const consoleRef = useRef<HTMLDivElement>(null)

  const parsed = useMemo(() => parse(steps), [steps])
  const messy = useMemo(() => new Set(messyLines(steps)), [steps])
  const errorLines = useMemo(() => (runError ? new Set([runError.line]) : new Set<number>()), [runError])

  useEffect(() => store.set('steps', steps), [steps])
  useEffect(() => {
    consoleRef.current?.scrollTo({ top: consoleRef.current.scrollHeight })
  }, [output])

  // ---------------------------------------------------------------------------
  // Running programs

  const draw = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const css = getComputedStyle(document.documentElement)
    render(ctx, engineRef.current, css.getPropertyValue('--stage-bg').trim(), css.getPropertyValue('--stage-grid').trim())
  }, [])

  const stop = useCallback(() => {
    engineRef.current?.stop()
    setRunning(false)
    setQuestion(null)
  }, [])

  const start = useCallback((source: string) => {
    const { program } = parse(source)
    engineRef.current?.stop()
    setOutput([])
    setRunError(null)
    setQuestion(null)
    if (!program) return
    const engine = new Engine(program, {
      say: (text) => setOutput((o) => [...o.slice(-199), text]),
      ask: (prompt) => setQuestion(prompt),
      error: (err) => setRunError(err),
      stopped: () => {
        setRunning(false)
        setQuestion(null)
      },
    })
    engineRef.current = engine
    setRunning(true)
    engine.start()
    canvasRef.current?.focus()
  }, [])

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let acc = 0
    const FRAME = 1000 / 60
    const loop = (now: number) => {
      acc += Math.min(250, now - last)
      last = now
      const engine = engineRef.current
      while (acc >= FRAME) {
        if (engine?.running) engine.step(FRAME)
        acc -= FRAME
      }
      draw()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [draw])

  useEffect(() => {
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLElement && e.target.closest('input, textarea') !== null
    const down = (e: KeyboardEvent) => {
      const engine = engineRef.current
      if (!engine?.running || typing(e)) return
      const key = toKey(e)
      if (!key) return
      if (key.length > 1) e.preventDefault()
      engine.keyDown(key)
    }
    const up = (e: KeyboardEvent) => {
      const key = toKey(e)
      if (key) engineRef.current?.keyUp(key)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // ---------------------------------------------------------------------------
  // Tidy & run: free fixes first, then this device's cache, then the server (shared cache → Muse).

  const applyTidy = (before: string, result: Tidied, how: string) => {
    setSteps(result.steps)
    setAssumptions(result.assumptions)
    setGlow(new Set(changedLines(before, result.steps)))
    setNote(how)
    start(result.steps)
  }

  const tidyAndRun = async () => {
    setNote(null)
    const fixed = autocorrect(steps)
    const source = fixed.source
    if (fixed.fixes.length) {
      setSteps(source)
      setGlow(new Set(fixed.fixes.map((f) => f.line)))
    }
    if (!messyLines(source).length) {
      if (fixed.fixes.length) setNote(`Fixed ${fixed.fixes.map((f) => `“${f.from}” → “${f.to}”`).join(', ')}`)
      start(source)
      return
    }

    const key = await cacheKey(source)
    const local = localCache.get(key)
    if (local) {
      applyTidy(source, local, '⚡ Remembered from before — no AI needed.')
      return
    }

    setBusy(true)
    try {
      const res = await fetch('/api/tidy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code || undefined, source }),
      })
      const data = await res.json().catch(() => ({ error: 'The server sent something unexpected.' }))
      if (!res.ok) {
        if (data.needsCode) setShowCode(true)
        setNote(data.error ?? 'Something went wrong.')
        return
      }
      localCache.set(key, { steps: data.steps, assumptions: data.assumptions })
      applyTidy(source, data, data.cached ? '⚡ Someone said this before — no AI needed.' : '✨ Tidied by Meta Muse.')
    } catch {
      setNote("Couldn't reach the server. Check your connection and try again.")
    } finally {
      setBusy(false)
    }
  }

  const saveCode = async (e: React.FormEvent) => {
    e.preventDefault()
    const candidate = codeInput.trim()
    if (!candidate) return
    const res = await fetch('/api/check-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: candidate }),
    }).catch(() => null)
    const data = res ? await res.json().catch(() => null) : null
    if (data?.ok) {
      setCode(candidate)
      store.set('code', candidate)
      setShowCode(false)
      setCodeInput('')
      setNote(`Unlocked! ${data.remaining} AI tidies left today.`)
    } else setNote(data?.error ?? "Couldn't check that code.")
  }

  // ---------------------------------------------------------------------------

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    engineRef.current?.click(((e.clientX - rect.left) / rect.width) * STAGE.width, ((e.clientY - rect.top) / rect.height) * STAGE.height)
  }

  const submitAnswer = (e: React.FormEvent) => {
    e.preventDefault()
    if (question === null) return
    setOutput((o) => [...o, `› ${answer}`])
    setQuestion(null)
    const text = answer
    setAnswer('')
    engineRef.current?.answer(text)
  }

  const loadSteps = (source: string) => {
    stop()
    setSteps(source.replace(/\r\n/g, '\n'))
    setAssumptions([])
    setGlow(new Set())
    setRunError(null)
    setNote(null)
  }

  const download = () => {
    const blob = new Blob([steps], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'my-game.say'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const needsTidy = messy.size > 0
  const firstError = runError ?? (needsTidy ? null : parsed.errors[0] ?? null)

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo">Sayntax</span>
          <span className="tagline">Say a game. Play it.</span>
        </div>
        <div className="top-actions">
          <select aria-label="Open an example" value="" onChange={(e) => e.target.value && loadSteps(EXAMPLES[e.target.value])}>
            <option value="">Examples…</option>
            {Object.keys(EXAMPLES).map((p) => (
              <option key={p} value={p}>
                {exampleName(p)}
              </option>
            ))}
          </select>
          <label className="btn ghost">
            Open
            <input type="file" accept=".say,.txt" hidden onChange={(e) => e.target.files?.[0]?.text().then(loadSteps)} />
          </label>
          <button className="btn ghost" onClick={download}>
            Save
          </button>
          <button className={`btn ghost ${code ? 'unlocked' : ''}`} onClick={() => setShowCode((s) => !s)}>
            {code ? '🔓 AI on' : '🔒 Access code'}
          </button>
        </div>
      </header>

      {showCode && (
        <form className="code-bar" onSubmit={saveCode}>
          <span>New words need the AI and an access code. Steps — and anything said before — always run free.</span>
          <input value={codeInput} onChange={(e) => setCodeInput(e.target.value)} placeholder="Access code" aria-label="Access code" />
          <button className="btn" type="submit">
            Unlock
          </button>
          {code && (
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                setCode('')
                store.set('code', '')
              }}
            >
              Forget code
            </button>
          )}
        </form>
      )}

      <main className="workspace">
        <section className="panel editor-panel">
          <div className="panel-head">
            <h2>Your game</h2>
            <span className="muted small">Write it your way. Lines with ✨ get tidied when you press play.</span>
          </div>
          <StepsEditor
            value={steps}
            onChange={(v) => {
              setSteps(v)
              setRunError(null)
              setGlow(new Set())
            }}
            highlighted={glow}
            messyLines={messy}
            errorLines={errorLines}
          />
          {firstError && (
            <div className="error-box" role="alert">
              <strong>Line {firstError.line}:</strong> {firstError.message}
            </div>
          )}
          {assumptions.length > 0 && (
            <div className="assumptions">
              <span className="label">I guessed:</span>
              {assumptions.map((a) => (
                <span key={a} className="chip">
                  {a}
                </span>
              ))}
              <span className="muted small">Change any of these in your game.</span>
            </div>
          )}
          {note && <div className="note">{note}</div>}
        </section>

        <section className="panel stage-panel">
          <div className="stage-controls">
            <button className="btn primary big" onClick={tidyAndRun} disabled={busy}>
              {busy ? 'Thinking…' : needsTidy ? '✨ Tidy & Play' : '▶ Play'}
            </button>
            <button className="btn" onClick={stop} disabled={!running}>
              ■ Stop
            </button>
            <span className="muted small">{running ? 'Playing — use the arrow keys, space and the mouse.' : ''}</span>
          </div>
          <canvas
            ref={canvasRef}
            className="stage"
            width={STAGE.width}
            height={STAGE.height}
            tabIndex={0}
            onClick={onCanvasClick}
            aria-label="Stage where your game runs"
          />
          <div className="console" ref={consoleRef} aria-live="polite">
            {output.length === 0 && !question && <span className="muted">Messages from “say” show up here.</span>}
            {output.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
          {question !== null && (
            <form className="ask-bar" onSubmit={submitAnswer}>
              <label htmlFor="answer">{question}</label>
              <input id="answer" value={answer} onChange={(e) => setAnswer(e.target.value)} autoFocus autoComplete="off" />
              <button className="btn primary">Answer</button>
            </form>
          )}
        </section>
      </main>
    </div>
  )
}
