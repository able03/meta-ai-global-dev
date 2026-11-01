// Runs a parsed Sayntax program. Pure logic — no DOM — so it can be tested headlessly.
// Each running script is a generator that yields when it needs to wait (a frame, a timer, an answer).

import { DEFAULT_SIZE, STAGE, type Cond, type Direction, type Expr, type Place, type PosSpec, type Program, type Ref, type SayntaxError, type Shape, type Side, type Stmt } from '../lang/ast.js'
import { COLORS, HELD_KEYS } from '../lang/words.js'

export interface Instance {
  id: number
  kind: string
  x: number
  y: number
  size: number
  color: string
  shape: Shape | null
  emoji: string | null
  vx: number
  vy: number
  bounce: boolean
  visible: boolean
  alive: boolean
  /** Keeps steering toward the nearest character of this kind. */
  chase: { target: string; speed: number } | null
  /** A speech bubble over the character (`hero says "Hi"`). */
  bubble: { text: string; until: number } | null
}

/** Live text on the screen, from `show "❤️ {hearts}" at top left`. */
export interface Label {
  text: string
  x: number
  y: number
  align: CanvasTextAlign
}

type Yield = { type: 'frame' } | { type: 'wait'; until: number } | { type: 'ask'; prompt: string }
type Script = Generator<Yield, void, string | undefined>

interface Task {
  gen: Script
  waitUntil: number
  asking: boolean
  resume: string | undefined
  done: boolean
}

/** Which instance "that ⭐" or "it" means inside a script. */
interface Ctx {
  bind: Map<string, Instance>
  last: Instance | null
}

interface Motion {
  vx: number
  vy: number
  bounce: boolean
  chase: { target: string; speed: number } | null
}

export interface EngineHooks {
  say(text: string): void
  ask(prompt: string): void
  error(err: SayntaxError): void
  stopped(): void
  sound?(name: string): void
}

class RuntimeFail extends Error {
  constructor(
    readonly line: number,
    message: string,
  ) {
    super(message)
  }
}

const HELD_INTERVAL_MS = 50
const FRAME_MS = 1000 / 60
const TOUCH_FACTOR = 0.8

export class Engine {
  readonly width = STAGE.width
  readonly height = STAGE.height
  time = 0
  things: Instance[] = []
  vars = new Map<string, number | string>()
  running = false
  /** The line each script is currently on — lets the UI glow the step being run. */
  activeLines = new Set<number>()
  background: { color: string | null; emoji: string | null } = { color: null, emoji: null }
  private solidKinds = new Set<string>()
  private labels = new Map<number, { expr: Expr; at: Place; line: number }>()

  private tasks: Task[] = []
  private kindMotion = new Map<string, Motion>()
  private keysDown = new Set<string>()
  private heldClock = 0
  private touching = new Set<string>()
  private atEdge = new Set<string>()
  private nextId = 1
  private asking: Task | null = null

  constructor(
    readonly program: Program,
    private readonly hooks: EngineHooks,
    private readonly random: () => number = Math.random,
  ) {}

  start(): void {
    this.running = true
    const main: Stmt[] = []
    for (const s of this.program.body) {
      if (s.k === 'forever' || s.k === 'every') this.spawn(this.exec(s, this.newCtx()))
      else if (s.k === 'whenStart') this.spawn(this.block(s.body, this.newCtx()))
      else if (!s.k.startsWith('when')) main.push(s)
    }
    this.tasks.unshift(this.makeTask(this.block(main, this.newCtx())))
    this.runTasks()
  }

  stop(): void {
    if (!this.running) return
    this.running = false
    this.tasks = []
    this.asking = null
    this.hooks.stopped()
  }

  /** Advances the world by one frame (~16ms). */
  step(dt: number = FRAME_MS): void {
    if (!this.running) return
    this.time += dt
    try {
      this.fireHeldKeys(dt)
      this.runTasks()
      this.physics()
      this.fireEdgeEvents()
      this.fireTouchEvents()
      this.runTasks()
      this.things = this.things.filter((t) => t.alive)
    } catch (e) {
      this.fail(e)
    }
  }

  keyDown(key: string): void {
    if (!this.running) return
    const first = !this.keysDown.has(key)
    this.keysDown.add(key)
    if (first && !HELD_KEYS.has(key)) this.fireKey(key)
  }

  keyUp(key: string): void {
    this.keysDown.delete(key)
  }

  click(x: number, y: number): void {
    if (!this.running) return
    for (const s of this.program.body) {
      if (s.k !== 'whenClick' || !s.ref.name) continue
      for (const inst of this.ofKind(s.ref.name)) {
        if (inst.visible && Math.hypot(inst.x - x, inst.y - y) <= inst.size / 2) {
          this.spawn(this.block(s.body, this.ctxWith(inst)))
        }
      }
    }
  }

  answer(text: string): void {
    const task = this.asking
    if (!task) return
    this.asking = null
    task.asking = false
    task.resume = text
    this.runTasks()
  }

  get isAsking(): boolean {
    return this.asking !== null
  }

  // -------------------------------------------------------------------------
  // Scheduling

  private makeTask(gen: Script): Task {
    return { gen, waitUntil: 0, asking: false, resume: undefined, done: false }
  }

  private spawn(gen: Script): void {
    this.tasks.push(this.makeTask(gen))
  }

  private runTasks(): void {
    try {
      // Tasks spawned while running get their first turn in the same pass.
      for (let i = 0; i < this.tasks.length && this.running; i++) {
        const task = this.tasks[i]
        if (task.done || task.asking || task.waitUntil > this.time) continue
        this.advance(task)
      }
      this.tasks = this.tasks.filter((t) => !t.done)
    } catch (e) {
      this.fail(e)
    }
  }

  private advance(task: Task): void {
    const value = task.resume
    task.resume = undefined
    const r = task.gen.next(value)
    if (r.done) {
      task.done = true
      return
    }
    const y = r.value
    if (y.type === 'wait') task.waitUntil = y.until
    else if (y.type === 'ask') {
      task.asking = true
      this.asking = task
      this.hooks.ask(y.prompt)
    }
  }

  private fail(e: unknown): void {
    if (e instanceof RuntimeFail) this.hooks.error({ line: e.line, message: e.message })
    else this.hooks.error({ line: 0, message: `Something went wrong: ${String(e)}` })
    this.stop()
  }

  // -------------------------------------------------------------------------
  // Running statements

  private newCtx(): Ctx {
    return { bind: new Map(), last: null }
  }

  private ctxWith(...insts: Instance[]): Ctx {
    const ctx = this.newCtx()
    for (const i of insts) {
      ctx.bind.set(i.kind, i)
      ctx.last = i
    }
    return ctx
  }

  private *block(stmts: Stmt[], ctx: Ctx): Script {
    for (const s of stmts) {
      if (!this.running) return
      yield* this.exec(s, ctx)
    }
  }

  private *exec(s: Stmt, ctx: Ctx): Script {
    this.activeLines.add(s.line)
    switch (s.k) {
      case 'thing': {
        const inst = this.create(s.name, s.at, s.line)
        ctx.bind.set(s.name, inst)
        ctx.last = inst
        break
      }
      case 'make': {
        const inst = this.create(s.name, s.at, s.line)
        ctx.bind.set(s.name, inst)
        ctx.last = inst
        break
      }
      case 'set':
        this.vars.set(s.name, this.eval(s.expr, s.line))
        break
      case 'change': {
        const current = this.vars.get(s.name) ?? 0
        const delta = this.num(this.eval(s.expr, s.line), s.line) * s.sign
        this.vars.set(s.name, this.num(current, s.line, s.name) + delta)
        break
      }
      case 'remove':
        for (const i of this.resolve(s.ref, ctx, s.line)) i.alive = false
        break
      case 'hide':
        for (const i of this.resolve(s.ref, ctx, s.line)) i.visible = false
        break
      case 'show':
        for (const i of this.resolve(s.ref, ctx, s.line)) i.visible = true
        break
      case 'bounce':
        this.setMotion(s.ref, ctx, s.line, (m) => (m.bounce = true))
        break
      case 'halt':
        this.setMotion(s.ref, ctx, s.line, (m) => {
          m.vx = 0
          m.vy = 0
        })
        break
      case 'moves': {
        const speed = this.num(this.eval(s.speed, s.line), s.line)
        const [dx, dy] = this.vector(s.dir)
        this.setMotion(s.ref, ctx, s.line, (m) => {
          m.vx = dx * speed
          m.vy = dy * speed
        })
        break
      }
      case 'move': {
        const amount = this.num(this.eval(s.amount, s.line), s.line)
        const [dx, dy] = this.vector(s.dir)
        for (const i of this.resolve(s.ref, ctx, s.line)) {
          this.stepTo(i, this.clampX(i.x + dx * amount, i), this.clampY(i.y + dy * amount, i))
        }
        break
      }
      case 'goto':
        for (const i of this.resolve(s.ref, ctx, s.line)) {
          i.x = this.pos(s.place.x, this.width, i.size)
          i.y = this.pos(s.place.y, this.height, i.size)
        }
        break
      case 'say':
        this.hooks.say(this.text(this.eval(s.expr, s.line)))
        break
      case 'background':
        this.background = { color: s.color ? COLORS[s.color] : null, emoji: s.emoji }
        break
      case 'solid':
        if (s.ref.name && !s.ref.that) this.solidKinds.add(s.ref.name)
        else for (const i of this.resolve(s.ref, ctx, s.line)) this.solidKinds.add(i.kind)
        break
      case 'chase': {
        const speed = this.num(this.eval(s.speed, s.line), s.line)
        const target = s.target.name ?? ctx.last?.kind
        if (!target) throw new RuntimeFail(s.line, 'Who should it chase? Use a name, like `👾 chases hero`.')
        this.setMotion(s.ref, ctx, s.line, (m) => (m.chase = { target, speed }))
        break
      }
      case 'label':
        this.labels.set(s.line, { expr: s.expr, at: s.at, line: s.line })
        break
      case 'speak': {
        const text = this.text(this.eval(s.expr, s.line))
        for (const i of this.resolve(s.ref, ctx, s.line)) i.bubble = { text, until: this.time + 2500 }
        this.hooks.say(text)
        break
      }
      case 'become':
        for (const i of this.resolve(s.ref, ctx, s.line)) {
          if (s.emoji) {
            i.emoji = s.emoji
            i.shape = null
          } else if (s.shape) {
            i.shape = s.shape
            i.emoji = null
          }
          if (s.color) i.color = COLORS[s.color] ?? i.color
          if (s.size) i.size = s.size
        }
        break
      case 'grow': {
        const amount = this.num(this.eval(s.amount, s.line), s.line) * s.sign
        for (const i of this.resolve(s.ref, ctx, s.line)) i.size = Math.min(400, Math.max(8, i.size + amount))
        break
      }
      case 'sound':
        this.hooks.sound?.(s.name)
        break
      case 'ask': {
        const answer = yield { type: 'ask', prompt: this.text(this.eval(s.prompt, s.line)) }
        const raw = (answer ?? '').trim()
        this.vars.set(s.name, raw !== '' && !Number.isNaN(Number(raw)) ? Number(raw) : raw)
        break
      }
      case 'wait':
        yield { type: 'wait', until: this.time + this.num(this.eval(s.seconds, s.line), s.line) * 1000 }
        break
      case 'stop':
        this.stop()
        return
      case 'forever':
        for (;;) {
          yield* this.block(s.body, ctx)
          if (!this.running) return
          yield { type: 'frame' }
        }
      case 'repeat': {
        const n = Math.floor(this.num(this.eval(s.count, s.line), s.line))
        for (let i = 0; i < n; i++) {
          yield* this.block(s.body, ctx)
          if (!this.running) return
          yield { type: 'frame' }
        }
        break
      }
      case 'if':
        if (this.test(s.cond, ctx, s.line)) yield* this.block(s.body, ctx)
        else if (s.otherwise) yield* this.block(s.otherwise, ctx)
        break
      case 'every': {
        const seconds = Math.max(0.05, this.num(this.eval(s.seconds, s.line), s.line))
        for (;;) {
          yield { type: 'wait', until: this.time + seconds * 1000 }
          if (!this.running) return
          this.spawn(this.block(s.body, this.newCtx()))
        }
      }
      case 'whenKey':
      case 'whenTouch':
      case 'whenEdge':
      case 'whenClick':
      case 'whenStart':
        break // events are wired up by the engine, not run in sequence
    }
  }

  // -------------------------------------------------------------------------
  // Characters

  private create(kind: string, at: Place | null, line: number): Instance {
    const look = this.program.looks[kind]
    if (!look) throw new RuntimeFail(line, `I don't know what "${kind}" looks like.`)
    const size = look.size ?? DEFAULT_SIZE
    const motion = this.kindMotion.get(kind)
    const inst: Instance = {
      id: this.nextId++,
      kind,
      x: at ? this.pos(at.x, this.width, size) : this.width / 2,
      y: at ? this.pos(at.y, this.height, size) : this.height / 2,
      size,
      color: COLORS[look.color ?? ''] ?? '#3b82f6',
      shape: look.shape,
      emoji: look.emoji,
      vx: motion?.vx ?? 0,
      vy: motion?.vy ?? 0,
      bounce: motion?.bounce ?? false,
      visible: true,
      alive: true,
      chase: motion?.chase ?? null,
      bubble: null,
    }
    this.things.push(inst)
    return inst
  }

  private ofKind(kind: string): Instance[] {
    return this.things.filter((t) => t.alive && t.kind === kind)
  }

  private resolve(ref: Ref, ctx: Ctx, line: number): Instance[] {
    if (ref.that) {
      const bound = ref.name ? ctx.bind.get(ref.name) : ctx.last
      if (bound) return bound.alive ? [bound] : []
      if (!ref.name) throw new RuntimeFail(line, 'I\'m not sure what "it" means here. Use the character\'s name instead.')
    }
    return this.ofKind(ref.name as string)
  }

  /**
   * Motion on a whole kind ("⭐ falls 3") also applies to stars made later.
   * Motion on "that ⭐" only changes that one.
   */
  private setMotion(ref: Ref, ctx: Ctx, line: number, change: (m: Motion) => void): void {
    if (!ref.that && ref.name) {
      const m = this.kindMotion.get(ref.name) ?? { vx: 0, vy: 0, bounce: false, chase: null }
      change(m)
      this.kindMotion.set(ref.name, m)
    }
    for (const i of this.resolve(ref, ctx, line)) change(i)
  }

  private vector(dir: Direction): [number, number] {
    switch (dir) {
      case 'up':
        return [0, -1]
      case 'down':
        return [0, 1]
      case 'left':
        return [-1, 0]
      case 'right':
        return [1, 0]
      case 'up-left':
        return [-1, -1]
      case 'up-right':
        return [1, -1]
      case 'down-left':
        return [-1, 1]
      case 'down-right':
        return [1, 1]
      case 'random': {
        const angle = this.random() * Math.PI * 2
        return [Math.cos(angle), Math.sin(angle)]
      }
    }
  }

  private pos(spec: PosSpec, extent: number, size: number): number {
    const half = size / 2
    switch (spec.kind) {
      case 'num':
        return spec.value
      case 'min':
        return half
      case 'mid':
        return extent / 2
      case 'max':
        return extent - half
      case 'random':
        return half + this.random() * (extent - size)
    }
  }

  private clampX(x: number, i: Instance): number {
    return Math.min(this.width - i.size / 2, Math.max(i.size / 2, x))
  }

  private clampY(y: number, i: Instance): number {
    return Math.min(this.height - i.size / 2, Math.max(i.size / 2, y))
  }

  // -------------------------------------------------------------------------
  // Physics and events

  private physics(): void {
    for (const t of this.things) {
      if (!t.alive) continue
      if (t.chase) this.steer(t, t.chase.target, t.chase.speed)
      if (t.bubble && t.bubble.until < this.time) t.bubble = null
      if (t.vx || t.vy) {
        const hit = this.stepTo(t, t.x + t.vx, t.y + t.vy)
        if (hit && t.bounce) {
          if (hit.x) t.vx = -t.vx
          if (hit.y) t.vy = -t.vy
        }
      }
      if (t.bounce) {
        const half = t.size / 2
        if ((t.x < half && t.vx < 0) || (t.x > this.width - half && t.vx > 0)) t.vx = -t.vx
        if ((t.y < half && t.vy < 0) || (t.y > this.height - half && t.vy > 0)) t.vy = -t.vy
        t.x = this.clampX(t.x, t)
        t.y = this.clampY(t.y, t)
      } else if (t.x < -200 || t.x > this.width + 200 || t.y < -200 || t.y > this.height + 200) {
        t.alive = false // drifted far off screen — tidy up
      }
    }
  }

  /**
   * Moves a character, but not into anything solid (walls). Tries each direction on its own,
   * so a hero can still slide along a wall. Returns which directions were blocked.
   */
  private stepTo(t: Instance, x: number, y: number): { x: boolean; y: boolean } | null {
    if (this.solidKinds.size === 0 || this.solidKinds.has(t.kind)) {
      t.x = x
      t.y = y
      return null
    }
    const blocked = { x: false, y: false }
    const fromX = t.x
    t.x = x
    if (this.hitsSolid(t)) {
      t.x = fromX
      blocked.x = true
    }
    const fromY = t.y
    t.y = y
    if (this.hitsSolid(t)) {
      t.y = fromY
      blocked.y = true
    }
    return blocked.x || blocked.y ? blocked : null
  }

  private hitsSolid(t: Instance): boolean {
    for (const w of this.things) {
      if (w === t || !w.alive || !w.visible || !this.solidKinds.has(w.kind)) continue
      const reach = (t.size + w.size) * 0.45
      if (Math.abs(t.x - w.x) < reach && Math.abs(t.y - w.y) < reach) return true
    }
    return false
  }

  /** Points a chaser at the nearest character of the target kind. */
  private steer(t: Instance, target: string, speed: number): void {
    let best: Instance | null = null
    let bestDist = Infinity
    for (const o of this.things) {
      if (o === t || !o.alive || o.kind !== target) continue
      const d = Math.hypot(o.x - t.x, o.y - t.y)
      if (d < bestDist) {
        best = o
        bestDist = d
      }
    }
    if (!best || bestDist < 1) {
      t.vx = 0
      t.vy = 0
      return
    }
    t.vx = ((best.x - t.x) / bestDist) * speed
    t.vy = ((best.y - t.y) / bestDist) * speed
  }

  /** On-screen text from `show "..." at ...`, with variables filled in. */
  labelTexts(): Label[] {
    const out: Label[] = []
    for (const l of this.labels.values()) {
      let text: string
      try {
        text = this.text(this.eval(l.expr, l.line))
      } catch {
        continue
      }
      const x = l.at.x.kind === 'min' ? 14 : l.at.x.kind === 'max' ? this.width - 14 : this.pos(l.at.x, this.width, 0)
      const y = l.at.y.kind === 'min' ? 28 : l.at.y.kind === 'max' ? this.height - 16 : this.pos(l.at.y, this.height, 0)
      const align: CanvasTextAlign = l.at.x.kind === 'min' ? 'left' : l.at.x.kind === 'max' ? 'right' : 'center'
      out.push({ text, x, y, align })
    }
    return out
  }

  private sidesTouched(t: Instance): Side[] {
    const half = t.size / 2
    const sides: Side[] = []
    if (t.x - half <= 0) sides.push('left')
    if (t.x + half >= this.width) sides.push('right')
    if (t.y - half <= 0) sides.push('top')
    if (t.y + half >= this.height) sides.push('bottom')
    return sides
  }

  private fireEdgeEvents(): void {
    const now = new Set<string>()
    this.program.body.forEach((s, idx) => {
      if (s.k !== 'whenEdge' || !s.ref.name) return
      for (const inst of this.ofKind(s.ref.name)) {
        const sides = this.sidesTouched(inst)
        const hit = s.side === 'any' ? sides.length > 0 : sides.includes(s.side)
        if (!hit) continue
        const key = `${idx}:${inst.id}`
        now.add(key)
        if (!this.atEdge.has(key)) this.spawn(this.block(s.body, this.ctxWith(inst)))
      }
    })
    this.atEdge = now
  }

  private fireTouchEvents(): void {
    const now = new Set<string>()
    this.program.body.forEach((s, idx) => {
      if (s.k !== 'whenTouch' || !s.a.name || !s.b.name) return
      for (const a of this.ofKind(s.a.name)) {
        for (const b of this.ofKind(s.b.name)) {
          if (a === b || !a.visible || !b.visible || !this.overlaps(a, b)) continue
          const key = `${idx}:${a.id}:${b.id}`
          now.add(key)
          if (!this.touching.has(key)) this.spawn(this.block(s.body, this.ctxWith(a, b)))
        }
      }
    })
    this.touching = now
  }

  private overlaps(a: Instance, b: Instance): boolean {
    return Math.hypot(a.x - b.x, a.y - b.y) < ((a.size + b.size) / 2) * TOUCH_FACTOR
  }

  private fireHeldKeys(dt: number): void {
    this.heldClock += dt
    if (this.heldClock < HELD_INTERVAL_MS) return
    this.heldClock = 0
    for (const key of this.keysDown) if (HELD_KEYS.has(key)) this.fireKey(key)
  }

  private fireKey(key: string): void {
    for (const s of this.program.body) {
      if (s.k === 'whenKey' && s.key === key) this.spawn(this.block(s.body, this.newCtx()))
    }
  }

  // -------------------------------------------------------------------------
  // Values

  private eval(e: Expr, line: number): number | string {
    switch (e.k) {
      case 'num':
        return e.value
      case 'str':
        return e.value.replace(/\{\s*([^}]+?)\s*\}/g, (_, name: string) => {
          const v = this.vars.get(name.toLowerCase())
          return v === undefined ? `{${name}}` : this.text(v)
        })
      case 'var': {
        const v = this.vars.get(e.name)
        if (v === undefined) throw new RuntimeFail(line, `"${e.name}" doesn't have a value yet. Give it one first, like \`${e.name} is 0\`.`)
        return v
      }
      case 'random': {
        const min = this.num(this.eval(e.min, line), line)
        const max = this.num(this.eval(e.max, line), line)
        const lo = Math.min(min, max)
        const hi = Math.max(min, max)
        if (Number.isInteger(lo) && Number.isInteger(hi)) return lo + Math.floor(this.random() * (hi - lo + 1))
        return lo + this.random() * (hi - lo)
      }
      case 'bin': {
        const l = this.eval(e.left, line)
        const r = this.eval(e.right, line)
        if (e.op === '+' && (typeof l === 'string' || typeof r === 'string')) return this.text(l) + this.text(r)
        const a = this.num(l, line)
        const b = this.num(r, line)
        if (e.op === '+') return a + b
        if (e.op === '-') return a - b
        if (e.op === '*') return a * b
        if (b === 0) throw new RuntimeFail(line, "You can't divide by zero.")
        return a / b
      }
    }
  }

  private test(c: Cond, ctx: Ctx, line: number): boolean {
    switch (c.k) {
      case 'and':
        return this.test(c.left, ctx, line) && this.test(c.right, ctx, line)
      case 'or':
        return this.test(c.left, ctx, line) || this.test(c.right, ctx, line)
      case 'key':
        return this.keysDown.has(c.key)
      case 'touches': {
        const as = this.resolve(c.a, ctx, line)
        const bs = this.resolve(c.b, ctx, line)
        return as.some((a) => bs.some((b) => a !== b && this.overlaps(a, b)))
      }
      case 'cmp': {
        const l = this.eval(c.left, line)
        const r = this.eval(c.right, line)
        if (c.op === '=') return this.same(l, r)
        if (c.op === '!=') return !this.same(l, r)
        const a = this.num(l, line)
        const b = this.num(r, line)
        if (c.op === '>') return a > b
        if (c.op === '<') return a < b
        if (c.op === '>=') return a >= b
        return a <= b
      }
    }
  }

  private same(a: number | string, b: number | string): boolean {
    if (typeof a === 'number' && typeof b === 'number') return a === b
    return this.text(a).trim().toLowerCase() === this.text(b).trim().toLowerCase()
  }

  private num(v: number | string, line: number, name?: string): number {
    if (typeof v === 'number') return v
    const n = Number(v)
    if (v.trim() !== '' && !Number.isNaN(n)) return n
    throw new RuntimeFail(line, `${name ? `"${name}"` : `"${v}"`} needs to be a number here.`)
  }

  private text(v: number | string): string {
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100)
    return v
  }
}
