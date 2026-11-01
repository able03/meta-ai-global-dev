import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CodeView } from './components/CodeView'
import { StepsEditor } from './components/StepsEditor'
import { STAGE } from './lang/ast'
import { parse } from './lang/parser'
import { toPython } from './lang/python'
import { Engine } from './runtime/engine'
import { render } from './runtime/render'

type View = 'words' | 'steps' | 'code'

interface Sentence {
  text: string
  lines: number[]
}

const EXAMPLES = import.meta.glob('../examples/*.say', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const exampleName = (path: string) => path.split('/').pop()!.replace('.say', '')

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
      /* storage unavailable — autosave is a convenience only */
    }
  },
}

const KEY_MAP: Record<string, string> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', ' ': 'space', Enter: 'enter' }
const toKey = (e: KeyboardEvent) => KEY_MAP[e.key] ?? (e.key.length === 1 ? e.key.toLowerCase() : null)

const FIRST_STEPS = EXAMPLES['../examples/bouncing-ball.say'] ?? ''

export function App() {
  const [view, setView] = useState<View>('words')
  const [words, setWords] = useState(() => store.get('words') ?? '')
  const [steps, setSteps] = useState(() => store.get('steps') ?? FIRST_STEPS)
  const [sentences, setSentences] = useState<Sentence[]>([])
  const [assumptions, setAssumptions] = useState<string[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [change, setChange] = useState('')
  const [code, setCode] = useState(() => store.get('code') ?? '')
  const [codeInput, setCodeInput] = useState('')
  const [showCode, setShowCode] = useState(false)
  const [busy, setBusy] = useState(false)
  const [aiMessage, setAiMessage] = useState<string | null>(null)

  const [running, setRunning] = useState(false)
  const [output, setOutput] = useState<string[]>([])
  const [question, setQuestion] = useState<string | null>(null)
  const [answer, setAnswer] = useState('')
  const [runError, setRunError] = useState<{ line: number; message: string } | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<Engine | null>(null)
  const consoleRef = useRef<HTMLDivElement>(null)

  const parsed = useMemo(() => parse(steps), [steps])
  const python = useMemo(() => (parsed.program ? toPython(parsed.program) : []), [parsed])
  const errorLines = useMemo(() => {
    const set = new Set(parsed.errors.map((e) => e.line))
    if (runError) set.add(runError.line)
    return set
  }, [parsed, runError])

  useEffect(() => store.set('steps', steps), [steps])
  useEffect(() => store.set('words', words), [words])
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

  const run = useCallback(
    (source?: string) => {
      const result = source !== undefined ? parse(source) : parsed
      engineRef.current?.stop()
      setOutput([])
      setRunError(null)
      setQuestion(null)
      if (!result.program) {
        setView('steps')
        return
      }
      const engine = new Engine(result.program, {
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
    },
    [parsed],
  )

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

  // ---------------------------------------------------------------------------
  // AI (Muse)

  const callAi = async (body: Record<string, string>): Promise<{ steps: string; assumptions: string[]; sentences: Sentence[] } | null> => {
    if (!code) {
      setShowCode(true)
      setAiMessage('Enter your access code to use the AI. (Typing Steps yourself is always free.)')
      return null
    }
    setBusy(true)
    setAiMessage(null)
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, ...body }),
      })
      const data = await res.json().catch(() => ({ error: 'The server sent something unexpected.' }))
      if (!res.ok) {
        if (res.status === 401) setShowCode(true)
        setAiMessage(data.error ?? 'Something went wrong.')
        return null
      }
      return data
    } catch {
      setAiMessage("Couldn't reach the server. Check your connection and try again.")
      return null
    } finally {
      setBusy(false)
    }
  }

  const makeIt = async () => {
    if (!words.trim()) return
    const data = await callAi({ words })
    if (!data) return
    setSteps(data.steps)
    setSentences(data.sentences)
    setAssumptions(data.assumptions)
    setSelected(new Set())
    setView('steps')
    run(data.steps)
  }

  const changeIt = async () => {
    if (!change.trim()) return
    const data = await callAi({ steps, instruction: change })
    if (!data) return
    setSteps(data.steps)
    setAssumptions(data.assumptions)
    setSentences((s) => [...s, ...data.sentences])
    setSelected(new Set(data.sentences.flatMap((s) => s.lines)))
    setChange('')
    run(data.steps)
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
      setAiMessage(`Unlocked! ${data.remaining} AI translations left today.`)
    } else setAiMessage(data?.error ?? "Couldn't check that code.")
  }

  // ---------------------------------------------------------------------------
  // Files

  const loadSteps = (source: string) => {
    stop()
    setSteps(source.replace(/\r\n/g, '\n'))
    setSentences([])
    setAssumptions([])
    setSelected(new Set())
    setRunError(null)
    setView('steps')
  }

  const download = () => {
    const blob = new Blob([steps], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'my-program.say'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const openFile = (file: File | undefined) => {
    if (file) file.text().then(loadSteps)
  }

  // ---------------------------------------------------------------------------

  const selectStep = (line: number) => setSelected(new Set([line]))
  const firstError = parsed.errors[0] ?? null

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo">Sayntax</span>
          <span className="tagline">Just say it.</span>
        </div>
        <div className="top-actions">
          <select
            aria-label="Open an example"
            value=""
            onChange={(e) => e.target.value && loadSteps(EXAMPLES[e.target.value])}
          >
            <option value="">Examples…</option>
            {Object.keys(EXAMPLES).map((p) => (
              <option key={p} value={p}>
                {exampleName(p).replace(/-/g, ' ')}
              </option>
            ))}
          </select>
          <label className="btn ghost">
            Open .say
            <input type="file" accept=".say,.txt" hidden onChange={(e) => openFile(e.target.files?.[0])} />
          </label>
          <button className="btn ghost" onClick={download}>
            Download .say
          </button>
          <button className={`btn ghost ${code ? 'unlocked' : ''}`} onClick={() => setShowCode((s) => !s)}>
            {code ? '🔓 AI on' : '🔒 Access code'}
          </button>
        </div>
      </header>

      {showCode && (
        <form className="code-bar" onSubmit={saveCode}>
          <span>The AI needs an access code (running and editing Steps is always free).</span>
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
          <nav className="tabs" role="tablist">
            {(
              [
                ['words', '📝 My words'],
                ['steps', '✨ Steps'],
                ['code', '🐍 Python'],
              ] as const
            ).map(([id, label]) => (
              <button key={id} role="tab" aria-selected={view === id} className={view === id ? 'tab on' : 'tab'} onClick={() => setView(id)}>
                {label}
                {id === 'steps' && parsed.errors.length > 0 && <span className="dot" title="Has a mistake" />}
              </button>
            ))}
          </nav>

          {view === 'words' && (
            <div className="view words-view">
              <label className="hint" htmlFor="words">
                Describe your program in your own words — messy is fine, any language works.
              </label>
              <textarea
                id="words"
                className="words-input"
                value={words}
                onChange={(e) => setWords(e.target.value)}
                placeholder="stars fall from the sky and I move a basket with the arrow keys to catch them. count how many I catch"
              />
              <div className="row-actions">
                <button className="btn primary" onClick={makeIt} disabled={busy || !words.trim()}>
                  {busy ? 'Thinking…' : '✨ Make it'}
                </button>
                <span className="muted small">Muse tidies your words into Steps you can read.</span>
              </div>
              {sentences.length > 0 && (
                <div className="sentences">
                  <div className="label">Your words became these Steps — click one:</div>
                  {sentences.map((s, i) => (
                    <button
                      key={i}
                      className={`sentence${s.lines.some((l) => selected.has(l)) ? ' active' : ''}`}
                      onClick={() => setSelected(new Set(s.lines))}
                    >
                      “{s.text}” <span className="muted">→ step {s.lines.join(', ')}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {view === 'steps' && (
            <div className="view steps-view">
              <StepsEditor
                value={steps}
                onChange={(v) => {
                  setSteps(v)
                  setRunError(null)
                }}
                highlighted={selected}
                errorLines={errorLines}
                onCursorLine={selectStep}
              />
              {(firstError || runError) && (
                <div className="error-box" role="alert">
                  <strong>Line {(firstError ?? runError)!.line}:</strong> {(firstError ?? runError)!.message}
                </div>
              )}
              {assumptions.length > 0 && (
                <div className="assumptions">
                  <span className="label">I assumed:</span>
                  {assumptions.map((a) => (
                    <span key={a} className="chip">
                      {a}
                    </span>
                  ))}
                  <span className="muted small">Change any of these in the Steps above.</span>
                </div>
              )}
              <form
                className="change-bar"
                onSubmit={(e) => {
                  e.preventDefault()
                  changeIt()
                }}
              >
                <input value={change} onChange={(e) => setChange(e.target.value)} placeholder="Change it… e.g. “make the stars fall faster”" aria-label="Describe a change" />
                <button className="btn" disabled={busy || !change.trim()}>
                  {busy ? 'Thinking…' : 'Change'}
                </button>
              </form>
            </div>
          )}

          {view === 'code' && (
            <div className="view">
              <CodeView lines={python} highlighted={selected} onSelectStep={selectStep} />
            </div>
          )}

          {aiMessage && <div className="ai-message">{aiMessage}</div>}
        </section>

        <section className="panel stage-panel">
          <div className="stage-controls">
            <button className="btn primary" onClick={() => run()} disabled={!parsed.program}>
              ▶ Run
            </button>
            <button className="btn" onClick={stop} disabled={!running}>
              ■ Stop
            </button>
            <span className="muted small">{running ? 'Running — use the keyboard and mouse on the stage.' : 'Runs instantly, no AI needed.'}</span>
          </div>
          <canvas
            ref={canvasRef}
            className="stage"
            width={STAGE.width}
            height={STAGE.height}
            tabIndex={0}
            onClick={onCanvasClick}
            aria-label="Stage where your program runs"
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
