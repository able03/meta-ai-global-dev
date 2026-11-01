// Turns a Sayntax program into real Python — no AI involved.
// Games become Pygame Zero (a beginner-friendly Python game library); text programs become plain Python.
// Every Python line remembers which Step it came from, so the UI can highlight them together.

import type { Cond, Direction, Expr, Place, PosSpec, Program, Ref, Stmt, StmtKind } from './ast.js'
import { DEFAULT_SIZE } from './ast.js'
import { WORD_FOR_EMOJI } from './words.js'

export interface PyLine {
  text: string
  /** The Step (line number in the .say source) this Python line came from. */
  src: number | null
  explain: string
}

const PY_KEYWORDS = new Set([
  'and', 'as', 'assert', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally', 'for',
  'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while',
  'with', 'yield', 'print', 'input', 'list', 'str', 'int', 'random', 'time', 'screen', 'clock', 'keyboard', 'keys',
  'draw', 'update', 'WIDTH', 'HEIGHT', 'Actor', 'True', 'False', 'None',
])

const EXPLAIN: Record<StmtKind, string> = {
  thing: 'Creates this character and puts it on the screen.',
  make: 'Makes a new copy and adds it to the list.',
  set: 'Stores a value in a variable.',
  change: 'Changes the number stored in a variable.',
  say: 'Prints a message.',
  ask: 'Asks a question and waits for the answer.',
  moves: 'Sets its speed: vx is sideways, vy is up and down (pixels per frame).',
  move: 'Moves it once.',
  goto: 'Jumps it to a new position (x, y).',
  bounce: 'Flips its direction when it hits the edge of the screen.',
  halt: 'Sets its speed to zero so it stops.',
  remove: 'Takes it off the screen for good.',
  hide: 'Makes it invisible.',
  show: 'Makes it visible again.',
  forever: 'Repeats the steps inside, forever.',
  repeat: 'Repeats the steps inside a set number of times.',
  if: 'Only runs the steps inside when this is true.',
  every: 'Runs these steps again and again on a timer.',
  wait: 'Pauses for a moment.',
  stop: 'Ends the program.',
  whenKey: 'Checks the keyboard.',
  whenTouch: 'Checks whether the two characters are overlapping.',
  whenEdge: 'Checks whether it reached the edge of the screen.',
  whenClick: 'Checks whether the mouse clicked on it.',
  whenStart: 'Runs once when the program starts.',
}

const GENERIC = {
  import: 'Loads a library — ready-made code you can use.',
  size: 'The size of the game window, in pixels.',
  list: 'An empty list that will hold every copy.',
  draw: 'draw() runs every frame and paints everything on the screen.',
  update: 'update() runs 60 times a second — this is where things move and react.',
  global: 'Lets this function change variables made outside it.',
  go: 'Starts the game.',
  key: 'Runs when a key is pressed down.',
  mouse: 'Runs when the mouse is clicked.',
  timer: 'Asks the clock to run this function on a timer.',
}

interface Scope {
  /** kind → Python name of the single instance being talked about ("star" inside `for star in stars`) */
  bound: Map<string, string>
  last: string | null
}

export function toPython(program: Program): PyLine[] {
  return new PyGen(program).generate()
}

class PyGen {
  private out: PyLine[] = []
  private names = new Map<string, string>()
  private collections = new Set<string>()
  private moving = new Set<string>()
  private bouncing = new Map<string, number>()
  private kindMotion = new Map<string, string>()
  private numericVars = new Set<string>()
  private usesRandom = false
  private usesTime = false
  private readonly isGame: boolean

  constructor(private readonly program: Program) {
    this.isGame = Object.keys(program.looks).length > 0
    this.scan(program.body)
  }

  generate(): PyLine[] {
    const body = this.program.body
    // Generate the body first so we know which imports are needed, then put the header on top.
    const bodyLines = this.isGame ? this.game(body) : this.text(body)
    this.out = []
    if (this.usesRandom) this.emit('import random', null, GENERIC.import)
    if (this.usesTime) this.emit('import time', null, GENERIC.import)
    if (this.isGame) this.emit('import pgzrun', null, 'Pygame Zero — a beginner-friendly library for making games.')
    if (this.out.length) this.blank()
    return [...this.out, ...bodyLines]
  }

  // -------------------------------------------------------------------------
  // Analysis

  private scan(stmts: Stmt[]): void {
    const visit = (list: Stmt[]) => {
      for (const s of list) {
        if (s.k === 'make') this.collections.add(s.name)
        if ((s.k === 'moves' || s.k === 'halt') && s.ref.name) this.moving.add(s.ref.name)
        if (s.k === 'bounce' && s.ref.name) {
          this.moving.add(s.ref.name)
          if (!this.bouncing.has(s.ref.name)) this.bouncing.set(s.ref.name, s.line)
        }
        if (s.k === 'change') this.numericVars.add(s.name)
        if (s.k === 'set' && (s.expr.k === 'num' || s.expr.k === 'random' || s.expr.k === 'bin')) this.numericVars.add(s.name)
        if (s.k === 'if') this.scanCond(s.cond)
        if ('body' in s) visit(s.body)
        if (s.k === 'if' && s.otherwise) visit(s.otherwise)
      }
    }
    visit(stmts)
    // Kind-wide motion ("⭐ falls 3") becomes the starting speed of every new copy.
    for (const s of stmts) {
      if (s.k === 'moves' && s.ref.name && !s.ref.that && this.collections.has(s.ref.name)) {
        this.kindMotion.set(s.ref.name, this.velocity(s.dir, s.speed))
      }
    }
  }

  private scanCond(c: Cond): void {
    if (c.k === 'and' || c.k === 'or') {
      this.scanCond(c.left)
      this.scanCond(c.right)
    } else if (c.k === 'cmp') {
      const numericSide = (e: Expr) => e.k === 'num' || e.k === 'random' || (e.k === 'var' && this.numericVars.has(e.name))
      const isOrder = c.op !== '=' && c.op !== '!='
      for (const [side, other] of [[c.left, c.right], [c.right, c.left]] as const) {
        if (side.k === 'var' && (isOrder || numericSide(other))) this.numericVars.add(side.name)
      }
    }
  }

  // -------------------------------------------------------------------------
  // Output helpers

  private emit(text: string, src: number | null, explain: string, indent = 0): void {
    this.out.push({ text: '    '.repeat(indent) + text, src, explain })
  }

  private blank(): void {
    this.out.push({ text: '', src: null, explain: '' })
  }

  private name(kind: string): string {
    const cached = this.names.get(kind)
    if (cached) return cached
    let base = WORD_FOR_EMOJI[kind] ?? kind.replace(/[^\p{L}\p{N}_]/gu, '_').replace(/^_+|_+$/g, '')
    if (!/^[A-Za-z_]/.test(base) || !base) base = `thing${this.names.size + 1}`
    if (PY_KEYWORDS.has(base) || this.program.vars.includes(base)) base = `${base}_`
    while ([...this.names.values()].includes(base)) base = `${base}_`
    this.names.set(kind, base)
    return base
  }

  private listName(kind: string): string {
    const n = this.name(kind)
    return n.endsWith('s') ? `${n}_list` : `${n}s`
  }

  private varName(name: string): string {
    return PY_KEYWORDS.has(name) ? `${name}_` : name.replace(/[^\p{L}\p{N}_]/gu, '_')
  }

  // -------------------------------------------------------------------------
  // Text-only programs (plain Python)

  private text(body: Stmt[]): PyLine[] {
    this.out = []
    const scope: Scope = { bound: new Map(), last: null }
    for (const s of body) this.stmt(s, 0, scope)
    return this.out
  }

  // -------------------------------------------------------------------------
  // Games (Pygame Zero)

  private game(body: Stmt[]): PyLine[] {
    this.out = []
    this.emit('WIDTH = 800', null, GENERIC.size)
    this.emit('HEIGHT = 500', null, GENERIC.size)
    this.blank()

    for (const kind of this.collections) this.emit(`${this.listName(kind)} = []`, null, GENERIC.list)

    const setup = body.filter((s) => !s.k.startsWith('when') && s.k !== 'forever' && s.k !== 'every')
    const starts = body.filter((s) => s.k === 'whenStart')
    const scope: Scope = { bound: new Map(), last: null }
    for (const s of setup) this.stmt(s, 0, scope)
    for (const s of starts) if (s.k === 'whenStart') for (const b of s.body) this.stmt(b, 0, scope)
    this.blank()

    this.drawFn()
    this.updateFn(body)
    this.keyDownFn(body)
    this.mouseFn(body)
    this.timers(body)

    this.emit('pgzrun.go()', null, GENERIC.go)
    return this.out
  }

  private drawFn(): void {
    this.emit('def draw():', null, GENERIC.draw)
    this.emit('screen.clear()', null, 'Wipes the screen before painting the next frame.', 1)
    for (const kind of Object.keys(this.program.looks)) {
      if (this.collections.has(kind)) {
        this.emit(`for ${this.name(kind)} in ${this.listName(kind)}:`, null, 'Goes through every copy in the list.', 1)
        this.emit(`${this.name(kind)}.draw()`, null, 'Paints it on the screen.', 2)
      } else if (this.definedSingles().has(kind)) {
        this.emit(`${this.name(kind)}.draw()`, null, 'Paints it on the screen.', 1)
      }
    }
    this.blank()
  }

  private definedSingles(): Set<string> {
    const set = new Set<string>()
    const visit = (list: Stmt[]) => {
      for (const s of list) {
        if (s.k === 'thing' && !this.collections.has(s.name)) set.add(s.name)
        if ('body' in s) visit(s.body)
        if (s.k === 'if' && s.otherwise) visit(s.otherwise)
      }
    }
    visit(this.program.body)
    return set
  }

  private updateFn(body: Stmt[]): void {
    this.emit('def update():', null, GENERIC.update)
    const globalsAt = this.out.length
    const scope = (): Scope => ({ bound: new Map(), last: null })
    const touched: Stmt[] = []

    for (const kind of this.moving) {
      const line = this.motionLine(kind)
      if (this.collections.has(kind)) {
        const item = this.name(kind)
        this.emit(`for ${item} in ${this.listName(kind)}:`, line, EXPLAIN.moves, 1)
        this.emit(`${item}.x += ${item}.vx`, line, 'Moves it sideways by its speed.', 2)
        this.emit(`${item}.y += ${item}.vy`, line, 'Moves it up or down by its speed.', 2)
      } else {
        const n = this.name(kind)
        this.emit(`${n}.x += ${n}.vx`, line, 'Moves it sideways by its speed.', 1)
        this.emit(`${n}.y += ${n}.vy`, line, 'Moves it up or down by its speed.', 1)
      }
    }
    for (const [kind, line] of this.bouncing) {
      const loop = this.collections.has(kind)
      const n = this.name(kind)
      const ind = loop ? 2 : 1
      if (loop) this.emit(`for ${n} in ${this.listName(kind)}:`, line, EXPLAIN.bounce, 1)
      this.emit(`if ${n}.left < 0 or ${n}.right > WIDTH:`, line, 'Did it hit the left or right edge?', ind)
      this.emit(`${n}.vx = -${n}.vx`, line, 'Flip the sideways direction.', ind + 1)
      this.emit(`if ${n}.top < 0 or ${n}.bottom > HEIGHT:`, line, 'Did it hit the top or bottom edge?', ind)
      this.emit(`${n}.vy = -${n}.vy`, line, 'Flip the up/down direction.', ind + 1)
    }
    for (const s of body) {
      if (s.k === 'whenKey' && isHeld(s.key)) {
        touched.push(s)
        this.emit(`if keyboard.${s.key}:`, s.line, `Is the ${s.key} key held down?`, 1)
        this.bodyOrPass(s.body, 2, scope())
      }
    }
    for (const s of body) {
      if (s.k === 'whenTouch') {
        touched.push(s)
        this.touchHandler(s)
      }
    }
    for (const s of body) {
      if (s.k === 'whenEdge') {
        touched.push(s)
        this.edgeHandler(s)
      }
    }
    for (const s of body) {
      if (s.k === 'forever') {
        touched.push(s)
        this.bodyOrPass(s.body, 1, scope(), 'Runs every frame (that\'s what "forever" means in a game).')
      }
    }
    if (this.out.length === globalsAt) this.emit('pass', null, 'Nothing to update yet.', 1)
    this.insertGlobals(globalsAt, touched, 1)
    this.blank()
  }

  private motionLine(kind: string): number | null {
    let line: number | null = null
    const visit = (list: Stmt[]) => {
      for (const s of list) {
        if (line === null && s.k === 'moves' && s.ref.name === kind) line = s.line
        if ('body' in s) visit(s.body)
        if (s.k === 'if' && s.otherwise) visit(s.otherwise)
      }
    }
    visit(this.program.body)
    return line
  }

  private touchHandler(s: Extract<Stmt, { k: 'whenTouch' }>): void {
    const a = s.a.name as string
    const b = s.b.name as string
    const scope: Scope = { bound: new Map(), last: null }
    let ind = 1
    const nameOf = (kind: string) => {
      if (this.collections.has(kind)) {
        const item = this.name(kind)
        this.emit(`for ${item} in ${this.listName(kind)}[:]:`, s.line, 'Checks every copy (a copy of the list, so removing is safe).', ind)
        ind++
        scope.bound.set(kind, item)
        scope.last = item
        return item
      }
      return this.name(kind)
    }
    const an = nameOf(a)
    const bn = nameOf(b)
    this.emit(`if ${an}.colliderect(${bn}):`, s.line, EXPLAIN.whenTouch, ind)
    this.bodyOrPass(s.body, ind + 1, scope)
  }

  private edgeHandler(s: Extract<Stmt, { k: 'whenEdge' }>): void {
    const kind = s.ref.name as string
    const scope: Scope = { bound: new Map(), last: null }
    let ind = 1
    const n = this.name(kind)
    if (this.collections.has(kind)) {
      this.emit(`for ${n} in ${this.listName(kind)}[:]:`, s.line, 'Checks every copy.', ind)
      ind++
    }
    scope.bound.set(kind, n)
    scope.last = n
    const checks = {
      left: `${n}.left <= 0`,
      right: `${n}.right >= WIDTH`,
      top: `${n}.top <= 0`,
      bottom: `${n}.bottom >= HEIGHT`,
    }
    const test = s.side === 'any' ? Object.values(checks).join(' or ') : checks[s.side]
    this.emit(`if ${test}:`, s.line, EXPLAIN.whenEdge, ind)
    this.bodyOrPass(s.body, ind + 1, scope)
  }

  private keyDownFn(body: Stmt[]): void {
    const handlers = body.filter((s): s is Extract<Stmt, { k: 'whenKey' }> => s.k === 'whenKey' && !isHeld(s.key))
    if (!handlers.length) return
    this.emit('def on_key_down(key):', null, GENERIC.key)
    const at = this.out.length
    for (const s of handlers) {
      this.emit(`if key == keys.${pgKey(s.key)}:`, s.line, `Was it the ${s.key} key?`, 1)
      this.bodyOrPass(s.body, 2, { bound: new Map(), last: null })
    }
    this.insertGlobals(at, handlers, 1)
    this.blank()
  }

  private mouseFn(body: Stmt[]): void {
    const handlers = body.filter((s): s is Extract<Stmt, { k: 'whenClick' }> => s.k === 'whenClick')
    if (!handlers.length) return
    this.emit('def on_mouse_down(pos):', null, GENERIC.mouse)
    const at = this.out.length
    for (const s of handlers) {
      const kind = s.ref.name as string
      const scope: Scope = { bound: new Map(), last: null }
      let ind = 1
      const n = this.name(kind)
      if (this.collections.has(kind)) {
        this.emit(`for ${n} in ${this.listName(kind)}[:]:`, s.line, 'Checks every copy.', ind)
        ind++
      }
      scope.bound.set(kind, n)
      scope.last = n
      this.emit(`if ${n}.collidepoint(pos):`, s.line, EXPLAIN.whenClick, ind)
      this.bodyOrPass(s.body, ind + 1, scope)
    }
    this.insertGlobals(at, handlers, 1)
    this.blank()
  }

  private timers(body: Stmt[]): void {
    let count = 0
    for (const s of body) {
      if (s.k !== 'every') continue
      count++
      const secs = this.expr(s.seconds)
      const fn = `every_${secs.replace(/[^0-9a-z]/gi, '_')}_second${count > 1 ? `_${count}` : ''}`
      this.emit(`def ${fn}():`, s.line, EXPLAIN.every)
      const at = this.out.length
      this.bodyOrPass(s.body, 1, { bound: new Map(), last: null })
      this.insertGlobals(at, [s], 1)
      this.blank()
      this.emit(`clock.schedule_interval(${fn}, ${secs})`, s.line, GENERIC.timer)
      this.blank()
    }
  }

  private insertGlobals(at: number, stmts: Stmt[], indent: number): void {
    const assigned = new Set<string>()
    const visit = (list: Stmt[]) => {
      for (const s of list) {
        if (s.k === 'set' || s.k === 'change' || s.k === 'ask') assigned.add(this.varName(s.name))
        if ('body' in s) visit(s.body)
        if (s.k === 'if' && s.otherwise) visit(s.otherwise)
      }
    }
    visit(stmts)
    if (!assigned.size) return
    this.out.splice(at, 0, { text: `${'    '.repeat(indent)}global ${[...assigned].join(', ')}`, src: null, explain: GENERIC.global })
  }

  private bodyOrPass(stmts: Stmt[], indent: number, scope: Scope, explain?: string): void {
    const before = this.out.length
    for (const s of stmts) this.stmt(s, indent, scope)
    if (this.out.length === before) this.emit('pass', null, explain ?? 'Nothing to do here.', indent)
  }

  // -------------------------------------------------------------------------
  // Statements

  private stmt(s: Stmt, ind: number, scope: Scope): void {
    const why = EXPLAIN[s.k]
    switch (s.k) {
      case 'thing': {
        const n = this.name(s.name)
        this.emit(`${n} = Actor("${n}", ${this.place(s.at, this.program.looks[s.name]?.size)})`, s.line, why, ind)
        if (this.collections.has(s.name)) this.emit(`${this.listName(s.name)}.append(${n})`, s.line, 'Adds it to the list.', ind)
        if (this.moving.has(s.name)) this.emit(`${n}.vx, ${n}.vy = 0, 0`, s.line, 'Starts out standing still.', ind)
        scope.bound.set(s.name, n)
        scope.last = n
        break
      }
      case 'make': {
        const n = this.name(s.name)
        this.emit(`${n} = Actor("${n}", ${this.place(s.at, this.program.looks[s.name]?.size)})`, s.line, why, ind)
        if (this.moving.has(s.name)) {
          this.emit(`${n}.vx, ${n}.vy = ${this.kindMotion.get(s.name) ?? '0, 0'}`, s.line, 'Gives the new copy its speed.', ind)
        }
        this.emit(`${this.listName(s.name)}.append(${n})`, s.line, 'Adds it to the list.', ind)
        scope.bound.set(s.name, n)
        scope.last = n
        break
      }
      case 'set':
        this.emit(`${this.varName(s.name)} = ${this.expr(s.expr)}`, s.line, why, ind)
        break
      case 'change':
        this.emit(`${this.varName(s.name)} ${s.sign > 0 ? '+=' : '-='} ${this.expr(s.expr)}`, s.line, why, ind)
        break
      case 'say':
        this.emit(`print(${this.expr(s.expr)})`, s.line, why, ind)
        break
      case 'ask': {
        const prompt = this.expr(s.prompt).replace(/(["'])$/, ' $1')
        const call = `input(${prompt})`
        const numeric = this.numericVars.has(s.name)
        this.emit(`${this.varName(s.name)} = ${numeric ? `int(${call})` : call}`, s.line, numeric ? `${why} int() turns the answer into a number.` : why, ind)
        break
      }
      case 'wait':
        this.usesTime = true
        this.emit(`time.sleep(${this.expr(s.seconds)})`, s.line, why, ind)
        break
      case 'stop':
        this.emit('exit()', s.line, why, ind)
        break
      case 'forever':
        this.emit('while True:', s.line, why, ind)
        this.bodyOrPass(s.body, ind + 1, scope)
        break
      case 'repeat':
        this.emit(`for i in range(${this.expr(s.count)}):`, s.line, why, ind)
        this.bodyOrPass(s.body, ind + 1, scope)
        break
      case 'if':
        this.ifChain(s, ind, scope, 'if')
        break
      case 'every':
        this.emit(`# every ${this.expr(s.seconds)} second(s):`, s.line, why, ind)
        this.bodyOrPass(s.body, ind, scope)
        break
      case 'moves':
        // "⭐ falls 3" at the top: every new star already gets this speed when it's made.
        if (ind === 0 && !s.ref.that && s.ref.name && this.kindMotion.has(s.ref.name)) break
        this.onEach(s.ref, scope, ind, s.line, (n, i) => this.emit(`${n}.vx, ${n}.vy = ${this.velocity(s.dir, s.speed)}`, s.line, why, i))
        break
      case 'halt':
        this.onEach(s.ref, scope, ind, s.line, (n, i) => this.emit(`${n}.vx, ${n}.vy = 0, 0`, s.line, why, i))
        break
      case 'bounce':
        if (ind > 0) this.emit(`# ${this.refName(s.ref, scope)} bounces off the edges (see update)`, s.line, why, ind)
        break
      case 'move': {
        const amount = this.expr(s.amount)
        this.onEach(s.ref, scope, ind, s.line, (n, i) => {
          const [dx, dy] = dirSigns(s.dir)
          if (s.dir === 'random') {
            this.usesRandom = true
            this.emit(`${n}.x += random.randint(-${amount}, ${amount})`, s.line, why, i)
            this.emit(`${n}.y += random.randint(-${amount}, ${amount})`, s.line, why, i)
            return
          }
          if (dx) this.emit(`${n}.x ${dx > 0 ? '+=' : '-='} ${amount}`, s.line, dx > 0 ? 'Moves it right (x gets bigger).' : 'Moves it left (x gets smaller).', i)
          if (dy) this.emit(`${n}.y ${dy > 0 ? '+=' : '-='} ${amount}`, s.line, dy > 0 ? 'Moves it down (y gets bigger).' : 'Moves it up (y gets smaller).', i)
        })
        break
      }
      case 'goto':
        this.onEach(s.ref, scope, ind, s.line, (n, i) => this.emit(`${n}.pos = ${this.place(s.place, DEFAULT_SIZE)}`, s.line, why, i))
        break
      case 'remove':
        this.onEach(s.ref, scope, ind, s.line, (n, i) => {
          const kind = s.ref.name ?? this.kindOf(n)
          if (kind && this.collections.has(kind)) this.emit(`${this.listName(kind)}.remove(${n})`, s.line, why, i)
          else this.emit(`${n}.pos = (-1000, -1000)`, s.line, 'Moves it far off the screen so it\'s gone.', i)
        })
        break
      case 'hide':
      case 'show':
        this.onEach(s.ref, scope, ind, s.line, (n, i) =>
          this.emit(`${n}.opacity = ${s.k === 'hide' ? 0 : 1}`, s.line, why, i),
        )
        break
      case 'whenKey':
      case 'whenTouch':
      case 'whenEdge':
      case 'whenClick':
      case 'whenStart':
        break
    }
  }

  private ifChain(s: Extract<Stmt, { k: 'if' }>, ind: number, scope: Scope, word: 'if' | 'elif'): void {
    this.emit(`${word} ${this.cond(s.cond, scope)}:`, s.line, EXPLAIN.if, ind)
    this.bodyOrPass(s.body, ind + 1, scope)
    if (!s.otherwise) return
    const only = s.otherwise.length === 1 ? s.otherwise[0] : null
    if (only && only.k === 'if') this.ifChain(only, ind, scope, 'elif')
    else {
      this.emit('else:', s.otherwise[0]?.line ?? s.line, 'Runs when the "if" above was not true.', ind)
      this.bodyOrPass(s.otherwise, ind + 1, scope)
    }
  }

  /** Runs `fn` for the one character meant, or loops over the list when a whole kind is meant. */
  private onEach(ref: Ref, scope: Scope, ind: number, line: number, fn: (name: string, indent: number) => void): void {
    if (ref.that || (ref.name && scope.bound.has(ref.name))) {
      fn(this.refName(ref, scope), ind)
      return
    }
    const kind = ref.name as string
    if (this.collections.has(kind)) {
      const item = this.name(kind)
      this.emit(`for ${item} in ${this.listName(kind)}[:]:`, line, 'Does this to every copy.', ind)
      fn(item, ind + 1)
    } else fn(this.name(kind), ind)
  }

  private refName(ref: Ref, scope: Scope): string {
    if (ref.name) return scope.bound.get(ref.name) ?? this.name(ref.name)
    return scope.last ?? 'it'
  }

  private kindOf(pyName: string): string | null {
    for (const [kind, n] of this.names) if (n === pyName) return kind
    return null
  }

  // -------------------------------------------------------------------------
  // Values

  private velocity(dir: Direction, speedExpr: Expr): string {
    const speed = this.expr(speedExpr)
    if (dir === 'random') {
      this.usesRandom = true
      return `random.uniform(-${speed}, ${speed}), random.uniform(-${speed}, ${speed})`
    }
    const [dx, dy] = dirSigns(dir)
    const part = (d: number) => (d === 0 ? '0' : d > 0 ? speed : `-${speed}`)
    return `${part(dx)}, ${part(dy)}`
  }

  private place(at: Place | null, size: number | null | undefined): string {
    const half = Math.round((size ?? DEFAULT_SIZE) / 2)
    if (!at) return '(WIDTH // 2, HEIGHT // 2)'
    const one = (spec: PosSpec, extent: 'WIDTH' | 'HEIGHT') => {
      switch (spec.kind) {
        case 'num':
          return String(spec.value)
        case 'min':
          return String(half)
        case 'mid':
          return `${extent} // 2`
        case 'max':
          return `${extent} - ${half}`
        case 'random':
          this.usesRandom = true
          return `random.randint(${half}, ${extent} - ${half})`
      }
    }
    return `(${one(at.x, 'WIDTH')}, ${one(at.y, 'HEIGHT')})`
  }

  private expr(e: Expr): string {
    switch (e.k) {
      case 'num':
        return String(e.value)
      case 'str': {
        if (/\{[^}]+\}/.test(e.value)) {
          const body = e.value.replace(/\{\s*([^}]+?)\s*\}/g, (_, v: string) => `{${this.varName(v.toLowerCase())}}`)
          return `f${JSON.stringify(body)}`
        }
        return JSON.stringify(e.value)
      }
      case 'var':
        return this.varName(e.name)
      case 'random':
        this.usesRandom = true
        return `random.randint(${this.expr(e.min)}, ${this.expr(e.max)})`
      case 'bin': {
        const wrap = (x: Expr) => (x.k === 'bin' ? `(${this.expr(x)})` : this.expr(x))
        return `${wrap(e.left)} ${e.op} ${wrap(e.right)}`
      }
    }
  }

  private cond(c: Cond, scope: Scope): string {
    switch (c.k) {
      case 'and':
      case 'or':
        return `${this.cond(c.left, scope)} ${c.k} ${this.cond(c.right, scope)}`
      case 'key':
        return isHeld(c.key) || c.key.length === 1 ? `keyboard.${c.key}` : `keyboard.${c.key}`
      case 'touches': {
        const a = this.refName(c.a, scope)
        const bKind = c.b.name
        if (bKind && this.collections.has(bKind) && !c.b.that && !scope.bound.has(bKind)) {
          const item = this.name(bKind)
          return `any(${a}.colliderect(${item}) for ${item} in ${this.listName(bKind)})`
        }
        return `${a}.colliderect(${this.refName(c.b, scope)})`
      }
      case 'cmp': {
        const op = c.op === '=' ? '==' : c.op
        return `${this.expr(c.left)} ${op} ${this.expr(c.right)}`
      }
    }
  }
}

function isHeld(key: string): boolean {
  return key === 'left' || key === 'right' || key === 'up' || key === 'down'
}

function pgKey(key: string): string {
  if (key === 'enter') return 'RETURN'
  if (/^[0-9]$/.test(key)) return `K_${key}`
  return key.toUpperCase()
}

function dirSigns(dir: Direction): [number, number] {
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
    case 'random':
      return [0, 0]
  }
}
