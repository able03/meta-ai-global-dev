import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Doodles } from './components/Doodles'
import { StepsEditor } from './components/StepsEditor'
import { WordBank } from './components/WordBank'
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

const IDEAS = [
  'a red ball that bounces around the screen',
  'a cat that catches falling fish when I press the arrow keys',
  'pick a secret number and let me guess it',
]

export function App() {
  const [steps, setSteps] = useState(() => store.get('steps') ?? '')
  const [glow, setGlow] = useState<Set<number>>(new Set())
  const [glowRun, setGlowRun] = useState(0)
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
  const inputRef = useRef<HTMLTextAreaElement>(null)

  /** Swipes the highlighter over these lines. */
  const mark = (lines: number[]) => {
    setGlow(new Set(lines))
    setGlowRun((r) => r + 1)
  }

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
    mark(changedLines(before, result.steps))
    setNote(how)
    start(result.steps)
  }

  const tidyAndRun = async () => {
    setNote(null)
    const fixed = autocorrect(steps)
    const source = fixed.source
    if (fixed.fixes.length) {
      setSteps(source)
      mark(fixed.fixes.map((f) => f.line))
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

  const pick = (snippet: string) => {
    const el = inputRef.current
    const at = el ? el.selectionEnd : steps.length
    const lineEnd = steps.indexOf('\n', at) === -1 ? steps.length : steps.indexOf('\n', at)
    const before = steps.slice(0, lineEnd)
    const lineStart = before.lastIndexOf('\n') + 1
    const currentLineEmpty = before.slice(lineStart).trim() === ''
    const insert = currentLineEmpty ? snippet : `\n${snippet}`
    const from = currentLineEmpty ? lineStart : lineEnd
    const next = steps.slice(0, from) + insert + steps.slice(currentLineEmpty ? lineEnd : lineEnd)
    setSteps(next)
    const firstNew = next.slice(0, from + (currentLineEmpty ? 0 : 1)).split('\n').length
    mark(snippet.split('\n').map((_, i) => firstNew + i))
    requestAnimationFrame(() => {
      el?.focus()
      const caret = from + insert.length
      el?.setSelectionRange(caret, caret)
    })
  }

  const needsTidy = messy.size > 0
  const firstError = runError ?? (needsTidy ? null : parsed.errors[0] ?? null)
  const empty = !steps.trim()

  return (
    <div className="desk">
      <Doodles />
      <header className="top">
        <h1 className="brand">
          <span className="brand-name">Sayntax</span>
          <span className="brand-line">Say a game. Play it.</span>
        </h1>
        <nav className="top-actions" aria-label="Game files">
          <select aria-label="Open an example game" value="" onChange={(e) => e.target.value && loadSteps(EXAMPLES[e.target.value])}>
            <option value="">Example games</option>
            {Object.keys(EXAMPLES).map((p) => (
              <option key={p} value={p}>
                {exampleName(p)}
              </option>
            ))}
          </select>
          <label className="tool">
            Open
            <input type="file" accept=".say,.txt" hidden onChange={(e) => e.target.files?.[0]?.text().then(loadSteps)} />
          </label>
          <button className="tool" onClick={download}>
            Save
          </button>
          <button className={`tool key ${code ? 'on' : ''}`} onClick={() => setShowCode((s) => !s)} aria-expanded={showCode}>
            {code ? '🔑 AI unlocked' : '🔑 Unlock AI'}
          </button>
        </nav>
      </header>

      {showCode && (
        <form className="key-card" onSubmit={saveCode}>
          <p>
            Your own words get tidied by Meta AI, and that needs a code. Steps from the word bank, example games, and anything
            someone already said run free.
          </p>
          <div className="key-row">
            <input value={codeInput} onChange={(e) => setCodeInput(e.target.value)} placeholder="Type your code" aria-label="Access code" />
            <button className="tool solid" type="submit">
              Unlock
            </button>
            {code && (
              <button
                className="tool"
                type="button"
                onClick={() => {
                  setCode('')
                  store.set('code', '')
                }}
              >
                Lock again
              </button>
            )}
          </div>
        </form>
      )}

      <main className="workspace">
        <div className="left">
          <section className="notebook" aria-labelledby="notebook-title">
            <div className="notebook-head">
              <h2 id="notebook-title">My game</h2>
              <p>
                Write it your way. Lines in <span className="pencil-word">pencil</span> are your own words — they get tidied into
                steps when you press Play.
              </p>
            </div>
            <div className="notebook-body">
              <StepsEditor
                value={steps}
                onChange={(v) => {
                  setSteps(v)
                  setRunError(null)
                  setGlow(new Set())
                }}
                highlighted={glow}
                highlightRun={glowRun}
                messyLines={messy}
                errorLines={errorLines}
                inputRef={inputRef}
              />
              {empty && (
                <div className="try-saying">
                  <p>Try writing…</p>
                  {IDEAS.map((idea) => (
                    <button key={idea} className="idea" onClick={() => setSteps(idea)}>
                      “{idea}”
                    </button>
                  ))}
                </div>
              )}
            </div>
            {(firstError || assumptions.length > 0 || note) && (
              <div className="notes">
                {firstError && (
                  <div className="sticky error" role="alert">
                    <strong>Line {firstError.line}</strong>
                    {firstError.message}
                  </div>
                )}
                {assumptions.length > 0 && (
                  <div className="sticky guess">
                    <strong>I guessed</strong>
                    <ul>
                      {assumptions.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                    <span className="sticky-foot">Change any of these in your game.</span>
                  </div>
                )}
                {note && <div className="sticky info">{note}</div>}
              </div>
            )}
          </section>
          <WordBank onPick={pick} />
        </div>

        <section className="console" aria-label="Game console">
          <div className="screen-frame">
            <canvas
              ref={canvasRef}
              className="screen"
              width={STAGE.width}
              height={STAGE.height}
              tabIndex={0}
              onClick={onCanvasClick}
              aria-label="Screen where your game plays"
            />
            {!running && !busy && <div className="screen-hint">{needsTidy ? 'Press ✨ to tidy and play' : 'Press ▶ to play'}</div>}
            {busy && <div className="screen-hint thinking">Tidying your words…</div>}
          </div>

          <div className="controls">
            <div className="dpad" aria-hidden>
              <span />
            </div>
            <button className={`play-button${needsTidy ? ' tidy' : ''}`} onClick={tidyAndRun} disabled={busy} aria-label={needsTidy ? 'Tidy and play' : 'Play'}>
              {busy ? '…' : needsTidy ? '✨' : '▶'}
            </button>
            <div className="play-label">{busy ? 'Thinking' : needsTidy ? 'Tidy & play' : running ? 'Play again' : 'Play'}</div>
            <button className="stop-button" onClick={stop} disabled={!running}>
              Stop
            </button>
          </div>

          <p className="console-help">{running ? 'Use the arrow keys, space and your mouse.' : ' '}</p>

          <div className="speech" ref={consoleRef} aria-live="polite">
            {output.length === 0 && !question && <p className="speech-empty">Words from “say” pop up here.</p>}
            {output.map((line, i) => (
              <div key={i} className={line.startsWith('› ') ? 'bubble me' : 'bubble'}>
                {line.startsWith('› ') ? line.slice(2) : line}
              </div>
            ))}
          </div>
          {question !== null && (
            <form className="ask" onSubmit={submitAnswer}>
              <label htmlFor="answer">{question}</label>
              <div className="ask-row">
                <input id="answer" value={answer} onChange={(e) => setAnswer(e.target.value)} autoFocus autoComplete="off" />
                <button className="tool solid">Answer</button>
              </div>
            </form>
          )}
        </section>
      </main>
    </div>
  )
}
