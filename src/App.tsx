import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Doodles } from './components/Doodles'
import { ArrowIcon, NibIcon, PlayIcon } from './components/Icons'
import { Scribble, type Mood } from './components/Scribble'
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
  /** Phones show one panel at a time; tablets slide the word bank in as a drawer. */
  const [panel, setPanel] = useState<'notebook' | 'play' | 'words'>('notebook')
  const [bankOpen, setBankOpen] = useState(false)
  /** A visitor's own Meta API key. Kept only in this browser. */
  const [ownKey, setOwnKey] = useState(() => store.get('ownkey') ?? '')
  const [ownKeyInput, setOwnKeyInput] = useState('')
  const [showCode, setShowCode] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  /** Something went wrong that isn't tied to a line (no code, server down, AI didn't understand). */
  const [problem, setProblem] = useState<string | null>(null)
  /** Bumps on every new error so the banner shakes again. */
  const [problemRun, setProblemRun] = useState(0)

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

  const [scribble, setScribble] = useState<{ mood: Mood; key: number; line: string | null }>({
    mood: 'hello',
    key: 0,
    line: "Hi, I'm Scribble! Write a game in the notebook, then press play.",
  })
  /** Tells Scribble how to react. */
  const feel = useCallback((mood: Mood, line: string | null) => setScribble((s) => ({ mood, key: s.key + 1, line })), [])

  const parsed = useMemo(() => parse(steps), [steps])
  const messy = useMemo(() => new Set(messyLines(steps)), [steps])
  const errorLines = useMemo(() => (runError ? new Set([runError.line]) : new Set<number>()), [runError])

  useEffect(() => store.set('steps', steps), [steps])
  useEffect(() => {
    if (!problem && !runError) return
    setProblemRun((r) => r + 1)
    feel('oops', runError ? `Uh oh, line ${runError.line} needs a fix.` : 'Uh oh! Read the red note.')
  }, [problem, runError, feel])
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
    feel('cheer', 'Your game is running!')
  }, [feel])

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
    feel('cheer', 'Tidied! The yellow lines are the new steps.')
  }

  const tidyAndRun = async () => {
    setNote(null)
    setProblem(null)
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
      applyTidy(source, local, 'Remembered from before — tidied for free.')
      return
    }

    setBusy(true)
    feel('thinking', 'Hmm… turning your words into steps.')
    try {
      const res = await fetch('/api/tidy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(ownKey ? { 'X-Model-Key': ownKey } : {}) },
        body: JSON.stringify({ code: code || undefined, source }),
      })
      const data = await res.json().catch(() => ({ error: 'The server sent something unexpected.' }))
      if (!res.ok) {
        if (data.needsCode || data.badKey) setShowCode(true)
        setProblem(data.error ?? 'Something went wrong.')
        return
      }
      localCache.set(key, { steps: data.steps, assumptions: data.assumptions })
      applyTidy(source, data, data.cached ? 'Someone wrote this before — tidied for free.' : 'Tidied by Meta Muse.')
    } catch {
      setProblem("Couldn't reach the server. Check your internet and press play again.")
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
    } else setProblem(data?.error ?? "Couldn't check that code.")
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
    setProblem(null)
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
  const oops = firstError ? `Oops! Check line ${firstError.line}` : problem ? 'Oops! See the note in your notebook' : null

  /** Puts the cursor on a line and scrolls the notebook to it. */
  const showLine = (line: number) => {
    const el = inputRef.current
    if (!el) return
    const lines = steps.split('\n')
    const start = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0)
    el.focus()
    el.setSelectionRange(start, start + (lines[line - 1]?.length ?? 0))
    el.scrollTop = Math.max(0, (line - 3) * 34)
    el.closest('.notebook')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  /** On-screen D-pad and A button: the same as pressing keys, for phones and tablets. */
  const pad = (key: string) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      engineRef.current?.keyDown(key)
    },
    onPointerUp: () => engineRef.current?.keyUp(key),
    onPointerCancel: () => engineRef.current?.keyUp(key),
    onLostPointerCapture: () => engineRef.current?.keyUp(key),
  })

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
          <button className={`tool key ${code || ownKey ? 'on' : ''}`} onClick={() => setShowCode((s) => !s)} aria-expanded={showCode}>
            {ownKey ? 'Using my API key' : code ? 'AI unlocked' : 'Unlock AI'}
          </button>
        </nav>
      </header>

      {showCode && (
        <div className="key-card">
          <p>
            Your own words get tidied by Meta AI. Steps from the word bank, example games, and anything someone already wrote run
            free — no code needed.
          </p>
          <form className="key-option" onSubmit={saveCode}>
            <h3>I have an access code</h3>
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
          <form
            className="key-option"
            onSubmit={(e) => {
              e.preventDefault()
              const k = ownKeyInput.trim()
              if (!k) return
              setOwnKey(k)
              store.set('ownkey', k)
              setOwnKeyInput('')
              setShowCode(false)
              setProblem(null)
              setNote('Using your own Meta API key. It stays in this browser.')
            }}
          >
            <h3>I have my own Meta API key</h3>
            <p className="key-small">
              No code or daily limit — you pay Meta for what you use. Your key stays in this browser. It's sent to our server only to
              talk to Meta, and is never saved there. Get one at dev.meta.ai.
            </p>
            <div className="key-row">
              <input
                type="password"
                value={ownKeyInput}
                onChange={(e) => setOwnKeyInput(e.target.value)}
                placeholder={ownKey ? 'Your key is saved — paste a new one to replace it' : 'Paste your API key'}
                aria-label="Your Meta API key"
                autoComplete="off"
              />
              <button className="tool solid" type="submit">
                Use my key
              </button>
              {ownKey && (
                <button
                  className="tool"
                  type="button"
                  onClick={() => {
                    setOwnKey('')
                    store.set('ownkey', '')
                  }}
                >
                  Remove my key
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      <main className={`workspace show-${panel}`}>
        <aside className={`bank-col${bankOpen ? ' open' : ''}`} aria-label="Word bank">
          <WordBank
            onPick={(snippet) => {
              pick(snippet)
              setBankOpen(false)
              setPanel('notebook')
            }}
            onClose={() => setBankOpen(false)}
          />
        </aside>
        {bankOpen && <div className="bank-scrim" onClick={() => setBankOpen(false)} aria-hidden />}

        <div className="notebook-col">
          <section className="notebook" aria-labelledby="notebook-title">
            <div className="notebook-head">
              <div className="notebook-title-row">
                <h2 id="notebook-title">My game</h2>
                <button className="tool bank-toggle" onClick={() => setBankOpen((o) => !o)} aria-expanded={bankOpen}>
                  Word bank
                </button>
              </div>
              <p>
                Write it your way. Lines in <span className="pencil-word">pencil</span> are your own words — they get tidied into
                steps when you press Play.
              </p>
            </div>
            {(firstError || problem) && (
              <div key={problemRun} className="error-banner" role="alert">
                <span className="error-badge" aria-hidden>
                  !
                </span>
                <div className="error-text">
                  <strong>{firstError ? `Oops — line ${firstError.line} needs fixing` : 'Oops!'}</strong>
                  <span>{firstError ? firstError.message : problem}</span>
                </div>
                {firstError && (
                  <button className="tool" onClick={() => showLine(firstError.line)}>
                    Show me
                  </button>
                )}
              </div>
            )}
            {(assumptions.length > 0 || note) && (
              <div className="notes">
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
            <div className="notebook-body">
              <StepsEditor
                value={steps}
                onChange={(v) => {
                  setSteps(v)
                  setRunError(null)
                  setProblem(null)
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
            <button
              className="mobile-play"
              onClick={() => {
                setPanel('play')
                tidyAndRun()
              }}
              disabled={busy}
            >
              {needsTidy ? <NibIcon size={24} /> : <PlayIcon size={22} />}
              {needsTidy ? 'Tidy & play' : 'Play my game'}
            </button>
          </section>
        </div>

        <section className="console" aria-label="Game console">
          <Scribble mood={scribble.mood} moodKey={scribble.key} line={scribble.line} />
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
            {!running && !busy && oops && <div className="screen-hint oops">{oops}</div>}
            {!running && !busy && !oops && (
              <div className="screen-hint">{needsTidy ? 'Press the pen to tidy your words and play' : empty ? 'Write a game in the notebook' : 'Press play'}</div>
            )}
            {busy && <div className="screen-hint thinking">Tidying your words…</div>}
          </div>

          <div className="controls">
            <div className="dpad" role="group" aria-label="Arrow keys">
              {(['up', 'left', 'right', 'down'] as const).map((d) => (
                <button key={d} className={`dpad-${d}`} aria-label={`${d} arrow`} disabled={!running} {...pad(d)}>
                  <ArrowIcon dir={d} />
                </button>
              ))}
              <span className="dpad-center" aria-hidden />
            </div>
            <button
              className={`play-button${needsTidy ? ' tidy' : ''}`}
              onClick={tidyAndRun}
              disabled={busy}
              aria-label={needsTidy ? 'Tidy my words and play' : 'Play'}
            >
              {busy ? <span className="dots" aria-hidden /> : needsTidy ? <NibIcon /> : <PlayIcon />}
            </button>
            <div className="play-label">{busy ? 'Thinking' : needsTidy ? 'Tidy & play' : running ? 'Play again' : 'Play'}</div>
            <div className="right-buttons">
              <button className="a-button" aria-label="Space key" disabled={!running} {...pad('space')}>
                A
              </button>
              <button className="stop-button" onClick={stop} disabled={!running}>
                Stop
              </button>
            </div>
          </div>

          <p className="console-help">{running ? 'Arrow keys or the D-pad move. Space or A works as the space key.' : ' '}</p>

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

      <nav className="tabbar" aria-label="Switch view">
        {(
          [
            ['notebook', 'Notebook'],
            ['play', 'Play'],
            ['words', 'Word bank'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} className={panel === id ? 'on' : ''} aria-pressed={panel === id} onClick={() => setPanel(id)}>
            {label}
            {id === 'notebook' && (firstError || problem) && <span className="tab-dot" aria-label="needs fixing" />}
          </button>
        ))}
      </nav>
    </div>
  )
}
