// Parses Sayntax source (.say) into a Program.
// Forgiving on purpose: case, "the/a/an", plurals and common synonyms don't matter,
// and every error is a kind, specific hint instead of an error code.

import { isSprite } from './characters.js'
import type {
  CmpOp,
  Cond,
  Direction,
  Expr,
  ParseResult,
  Place,
  PosSpec,
  Program,
  Ref,
  SayntaxError,
  Side,
  Stmt,
  ThingLook,
} from './ast.js'
import { stripComment, tokenize, type Tok } from './tokens.js'
import {
  closest,
  SOUNDS,
  COLORS,
  DIRECTIONS,
  EDGE_WORDS,
  EMOJI_FOR_WORD,
  KEY_NAMES,
  KEYWORDS,
  SHAPES,
  SIDES,
  SIZE_WORDS,
  TOUCH_VERBS,
} from './words.js'

class ParseFail extends Error {}

const fail = (message: string): never => {
  throw new ParseFail(message)
}

const BLOCK_STARTERS = new Set(['forever', 'always', 'repeat', 'loop', 'if', 'otherwise', 'every', 'each', 'when', 'whenever'])

/** Words that can never be a variable or character name. */
const RESERVED = new Set([
  ...KEYWORDS.filter((w) => !(w in COLORS) && !(w in SHAPES) && w !== 'key'), // "key" can be an RPG item
  'is', 'are', 'to', 'and', 'or', 'not', 'by', 'at', 'in', 'on', 'of', 'then', 'it', 'this', 'those',
  'with', 'than', 'time', 'second', 'background', 'sky', 'solid', 'all', 'every', 'toward', 'towards', 'sound',
])

// ---------------------------------------------------------------------------
// Cursor over one line's tokens

class Cursor {
  i = 0
  constructor(readonly toks: Tok[]) {}

  peek(offset = 0): Tok | undefined {
    return this.toks[this.i + offset]
  }
  done(): boolean {
    return this.i >= this.toks.length
  }
  isWord(...vs: string[]): boolean {
    const t = this.peek()
    return !!t && t.t === 'word' && (vs.length === 0 || vs.includes(t.v))
  }
  isWordAt(offset: number, ...vs: string[]): boolean {
    const t = this.peek(offset)
    return !!t && t.t === 'word' && vs.includes(t.v)
  }
  isSym(v: string): boolean {
    const t = this.peek()
    return !!t && t.t === 'sym' && t.v === v
  }
  eatWord(...vs: string[]): boolean {
    if (this.isWord(...vs)) {
      this.i++
      return true
    }
    return false
  }
  eatSym(v: string): boolean {
    if (this.isSym(v)) {
      this.i++
      return true
    }
    return false
  }
  next(): Tok {
    const t = this.peek()
    if (!t) fail('This step seems to stop too early.')
    this.i++
    return t as Tok
  }
  expectEnd(): void {
    const t = this.peek()
    if (t) fail(`I didn't expect "${t.v}" here.`)
  }
}

const isNameTok = (t: Tok | undefined): boolean =>
  !!t && (t.t === 'emoji' || (t.t === 'word' && !RESERVED.has(t.v)))

// ---------------------------------------------------------------------------
// Small pieces: names, refs, places, directions, expressions, conditions

function parseName(c: Cursor, what = 'a name'): string {
  const t = c.peek()
  if (!isNameTok(t)) fail(t ? `I expected ${what} here, not "${t.v}".` : `I expected ${what} at the end.`)
  c.i++
  return (t as Tok).v
}

function parseRef(c: Cursor): Ref {
  c.eatWord('all', 'every') // "remove all 👾" means every 👾, which a plain name already does
  if (c.eatWord('that', 'this', 'those', 'these')) {
    return { name: isNameTok(c.peek()) ? parseName(c) : null, that: true }
  }
  if (c.eatWord('it', 'them', 'itself')) return { name: null, that: true }
  return { name: parseName(c, 'a character'), that: false }
}

const isPlaceStart = (c: Cursor): boolean => {
  const t = c.peek()
  if (!t) return false
  if (t.t === 'num') return true
  return t.t === 'word' && ['random', 'top', 'bottom', 'left', 'right', 'center', 'anywhere'].includes(t.v)
}

function parsePlace(c: Cursor): Place | null {
  let x: PosSpec | null = null
  let y: PosSpec | null = null
  let any = false
  for (;;) {
    const t = c.peek()
    if (!t) break
    if (t.t === 'num') {
      c.i++
      const spec: PosSpec = { kind: 'num', value: Number(t.v) }
      if (!x) x = spec
      else if (!y) y = spec
      any = true
    } else if (c.eatWord('random')) {
      any = true
      if (c.eatWord('x')) x = { kind: 'random' }
      else if (c.eatWord('y')) y = { kind: 'random' }
      else {
        c.eatWord('place', 'spot', 'position', 'location')
        x = { kind: 'random' }
        y = { kind: 'random' }
      }
    } else if (c.eatWord('anywhere')) {
      x = { kind: 'random' }
      y = { kind: 'random' }
      any = true
    } else if (c.eatWord('left')) (x = { kind: 'min' }), (any = true)
    else if (c.eatWord('right')) (x = { kind: 'max' }), (any = true)
    else if (c.eatWord('top')) (y = { kind: 'min' }), (any = true)
    else if (c.eatWord('bottom')) (y = { kind: 'max' }), (any = true)
    else if (c.eatWord('center')) any = true
    else if (c.isSym(',') && isPlaceStartAt(c, 1)) c.i++
    else break
    c.eatWord('of')
    c.eatWord('screen', 'stage')
  }
  if (!any) return null
  return { x: x ?? { kind: 'mid' }, y: y ?? { kind: 'mid' } }
}

function isPlaceStartAt(c: Cursor, offset: number): boolean {
  const saved = c.i
  c.i += offset
  const ok = isPlaceStart(c)
  c.i = saved
  return ok
}

function parseDirection(c: Cursor): Direction | null {
  const t = c.peek()
  if (!t || t.t !== 'word') return null
  if (t.v === 'random' && !(c.peek(1)?.t === 'num')) {
    c.i++
    c.eatWord('direction', 'directions')
    return 'random'
  }
  const d = DIRECTIONS[t.v]
  if (!d) return null
  c.i++
  // "down and right" → down-right
  if (c.isWord('and') && c.peek(1)?.t === 'word' && DIRECTIONS[(c.peek(1) as Tok).v]) {
    const other = DIRECTIONS[(c.peek(1) as Tok).v]
    const combo = combine(d, other)
    if (combo) {
      c.i += 2
      return combo
    }
  }
  return d
}

function combine(a: Direction, b: Direction): Direction | null {
  const vert = [a, b].find((d) => d === 'up' || d === 'down')
  const horiz = [a, b].find((d) => d === 'left' || d === 'right')
  return vert && horiz ? (`${vert}-${horiz}` as Direction) : null
}

function parseExpr(c: Cursor): Expr {
  let left = parseTerm(c)
  for (;;) {
    if (c.eatSym('+') || c.eatWord('plus')) left = { k: 'bin', op: '+', left, right: parseTerm(c) }
    else if (c.eatSym('-') || c.eatWord('minus')) left = { k: 'bin', op: '-', left, right: parseTerm(c) }
    else return left
  }
}

function parseTerm(c: Cursor): Expr {
  let left = parseAtom(c)
  for (;;) {
    if (c.eatSym('*')) left = { k: 'bin', op: '*', left, right: parseAtom(c) }
    else if (c.eatSym('/')) left = { k: 'bin', op: '/', left, right: parseAtom(c) }
    else if (c.isWord('multiplied') && c.isWordAt(1, 'by')) {
      c.i += 2
      left = { k: 'bin', op: '*', left, right: parseAtom(c) }
    } else if (c.isWord('divided') && c.isWordAt(1, 'by')) {
      c.i += 2
      left = { k: 'bin', op: '/', left, right: parseAtom(c) }
    } else return left
  }
}

function parseAtom(c: Cursor): Expr {
  const t = c.peek()
  if (!t) return fail('Something is missing at the end of this step.')
  if (t.t === 'sym' && t.v === '-' && c.peek(1)?.t === 'num') {
    c.i += 2
    return { k: 'num', value: -Number((c.peek(-1) as Tok).v) }
  }
  if (t.t === 'num') {
    c.i++
    return { k: 'num', value: Number(t.v) }
  }
  if (t.t === 'str') {
    c.i++
    return { k: 'str', value: t.v }
  }
  if (c.eatSym('(')) {
    const e = parseExpr(c)
    if (!c.eatSym(')')) fail('A "(" is missing its ")".')
    return e
  }
  if (c.eatWord('random')) {
    while (c.eatWord('number', 'between', 'from')) {
      /* skip */
    }
    const min = parseTerm(c)
    if (!c.eatWord('to', 'and')) fail('Write a random number like this: `random 1 to 10`.')
    const max = parseTerm(c)
    return { k: 'random', min, max }
  }
  if (isNameTok(t)) {
    c.i++
    return { k: 'var', name: t.v }
  }
  return fail(`I expected a number, some "text" or a name here, not "${t.v}".`)
}

const isKeyTok = (t: Tok | undefined): boolean => !!t && (t.t === 'word' || t.t === 'num') && KEY_NAMES.has(t.v)

/** "left key is pressed", "key left is pressed", "space is pressed" → the key name. */
function parseKeyCond(c: Cursor): string | null {
  let key: string | null = null
  if (c.isWord('key') && isKeyTok(c.peek(1))) {
    key = (c.peek(1) as Tok).v
    c.i += 2
  } else if (isKeyTok(c.peek())) {
    const pressedNext = c.isWordAt(1, 'pressed', 'held') || (c.isWordAt(1, 'is') && c.isWordAt(2, 'pressed', 'held'))
    if (c.isWordAt(1, 'key') || pressedNext) {
      key = (c.peek() as Tok).v
      c.i++
      c.eatWord('key')
    }
  }
  if (!key) return null
  c.eatWord('is', 'gets', 'being')
  c.eatWord('pressed', 'held', 'down', 'tapped')
  return key
}

function parseCmpOp(c: Cursor): CmpOp | null {
  if (c.eatSym('=')) {
    c.eatSym('=')
    return '='
  }
  if (c.eatSym('!=')) return '!='
  if (c.eatSym('>=')) return '>='
  if (c.eatSym('<=')) return '<='
  if (c.eatSym('>')) return '>'
  if (c.eatSym('<')) return '<'
  if (c.eatWord('equals', 'equal')) {
    c.eatWord('to')
    return '='
  }
  if (c.eatWord('is', 'are')) {
    if (c.eatWord('not')) return '!='
    if (c.eatWord('more', 'greater', 'bigger', 'higher', 'larger', 'over', 'above')) {
      c.eatWord('than')
      return '>'
    }
    if (c.eatWord('less', 'smaller', 'lower', 'under', 'below', 'fewer')) {
      c.eatWord('than')
      return '<'
    }
    if (c.isWord('at') && c.isWordAt(1, 'least')) {
      c.i += 2
      return '>='
    }
    if (c.isWord('at') && c.isWordAt(1, 'most')) {
      c.i += 2
      return '<='
    }
    if (c.eatWord('equal')) c.eatWord('to')
    else if (c.isWord('same') && c.isWordAt(1, 'as')) c.i += 2
    return '='
  }
  return null
}

function parseCond(c: Cursor): Cond {
  let left = parseSingleCond(c)
  for (;;) {
    if (c.eatWord('and')) left = { k: 'and', left, right: parseSingleCond(c) }
    else if (c.eatWord('or')) left = { k: 'or', left, right: parseSingleCond(c) }
    else return left
  }
}

function parseSingleCond(c: Cursor): Cond {
  const key = parseKeyCond(c)
  if (key) return { k: 'key', key }
  // "ball touches star" / "ball is touching star"
  const t1 = c.peek(1)
  const t2 = c.peek(2)
  const touchAt1 = t1?.t === 'word' && TOUCH_VERBS.has(t1.v)
  const touchAt2 = t1?.t === 'word' && t1.v === 'is' && t2?.t === 'word' && TOUCH_VERBS.has(t2.v)
  if ((isNameTok(c.peek()) || c.isWord('that', 'it')) && (touchAt1 || touchAt2)) {
    const a = parseRef(c)
    c.eatWord('is')
    c.next()
    c.eatWord('with', 'into')
    return { k: 'touches', a, b: parseRef(c) }
  }
  const left = parseExpr(c)
  const op = parseCmpOp(c)
  if (!op) return fail('I need a comparison here, like `score is 10` or `score is more than 5`.')
  return { k: 'cmp', op, left, right: parseExpr(c) }
}

// ---------------------------------------------------------------------------
// Statements

function parseLook(c: Cursor, defaultShape = true): { look: ThingLook; at: Place | null } {
  const look: ThingLook = { color: null, shape: null, emoji: null, size: null }
  let at: Place | null = null
  while (!c.done()) {
    const t = c.peek() as Tok
    if (c.eatSym(',') || c.eatWord('and', 'with')) continue
    if (t.t === 'emoji') {
      look.emoji = t.v
      c.i++
    } else if (t.t === 'word' && isSprite(t.v)) {
      look.sprite = t.v
      c.i++
    } else if (t.t === 'word' && t.v in COLORS) {
      look.color = t.v
      c.i++
    } else if (t.t === 'word' && t.v in SHAPES) {
      look.shape = SHAPES[t.v]
      c.i++
    } else if (t.t === 'word' && t.v in SIZE_WORDS) {
      look.size = SIZE_WORDS[t.v]
      c.i++
    } else if (c.eatWord('size')) {
      c.eatWord('of')
      const n = c.next()
      if (n.t !== 'num') fail('Write a size as a number, like `size 40`.')
      look.size = Number(n.v)
    } else if (c.eatWord('at', 'in', 'on')) {
      at = parsePlace(c)
      if (!at) fail('Where should it go? Try `at center` or `at 100, 200`.')
    } else if (isPlaceStart(c)) {
      at = parsePlace(c)
    } else {
      fail(`I don't know how to draw "${t.v}". Try a character (knight, wizard, slime, dragon…), a shape (circle, square), a color, or an emoji.`)
    }
  }
  if (defaultShape && !look.shape && !look.emoji && !look.sprite) look.shape = 'circle'
  return { look, at }
}

const startsLook = (t: Tok | undefined): boolean =>
  !!t && (t.t === 'emoji' || (t.t === 'word' && (t.v in COLORS || t.v in SHAPES || t.v in SIZE_WORDS || isSprite(t.v))))

function parseSimple(toks: Tok[], line: number): Stmt {
  const c = new Cursor(toks)
  const stmt = parseSimpleInner(c, line)
  c.expectEnd()
  return stmt
}

function parseSimpleInner(c: Cursor, line: number): Stmt {
  const first = c.peek()
  if (!first) return fail('This step is empty.')

  if (first.t === 'word') {
    switch (first.v) {
      case 'say':
      case 'tell':
        c.i++
        return { line, k: 'say', expr: parseSayText(c) }
      case 'show':
        if (c.peek(1)?.t === 'str') {
          // `show "❤️ {hearts}" at top left` puts live text on the screen; without a place it's like say
          c.i++
          const saved = c.i
          const expr = parseExpr(c)
          if (c.eatWord('at', 'on', 'in')) return { line, k: 'label', expr, at: requirePlace(c) }
          if (c.done()) return { line, k: 'say', expr }
          c.i = saved
          return { line, k: 'say', expr: parseSayText(c) }
        }
        c.i++
        return { line, k: 'show', ref: parseRef(c) }
      case 'play': {
        c.i++
        c.eatWord('sound', 'noise')
        const t = c.next()
        c.eatWord('sound', 'noise')
        if (!SOUNDS.includes(t.v)) {
          const guess = closest(t.v, SOUNDS)
          fail(guess ? `I don't know the sound "${t.v}" — did you mean "${guess}"?` : `Try one of these sounds: ${SOUNDS.join(', ')}.`)
        }
        return { line, k: 'sound', name: t.v }
      }
      case 'background':
      case 'sky':
        c.i++
        c.eatWord('is', 'to', 'becomes', 'color', 'colour')
        return parseBackground(c, line)
      case 'hide':
        c.i++
        return { line, k: 'hide', ref: parseRef(c) }
      case 'remove':
        c.i++
        return { line, k: 'remove', ref: parseRef(c) }
      case 'ask': {
        c.i++
        const prompt = parseExpr(c)
        c.eatWord('and')
        c.eatWord('save', 'store', 'put', 'keep', 'remember')
        c.eatWord('it', 'answer')
        c.eatWord('into', 'in', 'as', 'to', 'inside')
        const name = c.done() ? 'answer' : parseName(c, 'a name to keep the answer in')
        return { line, k: 'ask', prompt, name }
      }
      case 'wait':
      case 'pause': {
        c.i++
        c.eatWord('for')
        const seconds: Expr = c.done() ? { k: 'num', value: 1 } : parseExpr(c)
        c.eatWord('second')
        return { line, k: 'wait', seconds }
      }
      case 'stop':
      case 'end':
      case 'quit':
        c.i++
        if (!c.done() && (isNameTok(c.peek()) || c.isWord('that', 'it'))) {
          const ref = parseRef(c)
          c.eatWord('moving')
          return { line, k: 'halt', ref }
        }
        c.eatWord('game', 'program', 'everything')
        return { line, k: 'stop' }
      case 'make': {
        c.i++
        const name = parseName(c, 'what to make')
        c.eatWord('at', 'in', 'on')
        return { line, k: 'make', name, at: parsePlace(c) }
      }
      case 'move':
      case 'push':
      case 'nudge': {
        c.i++
        const ref = parseRef(c)
        if (c.eatWord('to')) return { line, k: 'goto', ref, place: requirePlace(c) }
        let dir = parseDirection(c)
        c.eatWord('by')
        const amount: Expr = c.done() ? { k: 'num', value: 10 } : parseExpr(c)
        if (!dir) dir = parseDirection(c)
        if (!dir) fail('Which way? Try `move ball left 10` (up, down, left or right).')
        return { line, k: 'move', ref, dir: dir as Direction, amount }
      }
      case 'put':
      case 'place':
      case 'teleport': {
        c.i++
        const ref = parseRef(c)
        c.eatWord('at', 'in', 'on', 'to')
        return { line, k: 'goto', ref, place: requirePlace(c) }
      }
      case 'set': {
        c.i++
        const name = parseName(c)
        if (!c.eatWord('to', 'is') && !c.eatSym('=')) fail('Write it like this: `set score to 0`.')
        return { line, k: 'set', name, expr: parseExpr(c) }
      }
      case 'add': {
        c.i++
        const expr = parseExpr(c)
        if (!c.eatWord('to')) fail('Write it like this: `add 1 to score`.')
        return { line, k: 'change', name: parseName(c), expr, sign: 1 }
      }
      case 'subtract':
      case 'take': {
        c.i++
        c.eatWord('away')
        const expr = parseExpr(c)
        if (!c.eatWord('from')) fail('Write it like this: `subtract 1 from lives`.')
        return { line, k: 'change', name: parseName(c), expr, sign: -1 }
      }
      case 'increase':
      case 'decrease':
      case 'change': {
        c.i++
        const name = parseName(c)
        const expr: Expr = c.eatWord('by') ? parseExpr(c) : { k: 'num', value: 1 }
        return { line, k: 'change', name, expr, sign: first.v === 'decrease' ? -1 : 1 }
      }
      case 'bounce':
        c.i++
        return { line, k: 'bounce', ref: parseRef(c) }
    }
    if (BLOCK_STARTERS.has(first.v)) {
      fail(`Put a ":" at the end of this line and indent the steps that belong to it.`)
    }
  }

  // Sentences that start with a character or variable: "ball moves right 5", "score is 0"
  const ref = parseRef(c)
  if (c.eatSym('=')) {
    if (!ref.name || ref.that) fail('Give the value a name first, like `score = 0`.')
    return { line, k: 'set', name: ref.name as string, expr: parseExpr(c) }
  }
  if (c.eatWord('is', 'are')) {
    if (c.eatWord('solid', 'wall', 'walls', 'blocking')) return { line, k: 'solid', ref }
    if (!ref.name || ref.that) fail('Give it a name first, like `ball is a red circle`.')
    if (startsLook(c.peek())) {
      const { look, at } = parseLook(c)
      return { line, k: 'thing', name: ref.name as string, at, ...look }
    }
    return { line, k: 'set', name: ref.name as string, expr: parseExpr(c) }
  }
  const verb = c.next()
  if (verb.t !== 'word') return fail(`I didn't expect "${verb.v}" here.`)
  switch (verb.v) {
    case 'moves':
    case 'move':
    case 'goes':
    case 'go':
    case 'runs':
    case 'flies':
    case 'walks':
    case 'slides':
    case 'drives':
    case 'swims':
    case 'travels': {
      if (c.eatWord('to')) return { line, k: 'goto', ref, place: requirePlace(c) }
      if (c.eatWord('toward', 'towards')) return parseChase(c, line, ref)
      let dir = parseDirection(c)
      c.eatWord('at', 'with')
      c.eatWord('speed')
      const speed: Expr = c.done() || c.isWord('speed') ? { k: 'num', value: 5 } : parseExpr(c)
      c.eatWord('speed')
      if (!dir) dir = parseDirection(c)
      if (!dir) fail('Which way? Try `ball moves right 5` (up, down, left, right, down-right, or randomly).')
      return { line, k: 'moves', ref, dir: dir as Direction, speed }
    }
    case 'falls':
    case 'fall':
    case 'drops':
    case 'rises':
    case 'floats': {
      c.eatWord('down', 'up')
      c.eatWord('at', 'with')
      c.eatWord('speed')
      const speed: Expr = c.done() ? { k: 'num', value: 3 } : parseExpr(c)
      const dir: Direction = verb.v === 'rises' || verb.v === 'floats' ? 'up' : 'down'
      return { line, k: 'moves', ref, dir, speed }
    }
    case 'bounces':
    case 'bounce':
      c.eatWord('off', 'around')
      while (c.isWord(...EDGE_WORDS) || c.isWord('of')) c.i++
      return { line, k: 'bounce', ref }
    case 'stops':
    case 'stop':
    case 'freezes':
      c.eatWord('moving')
      return { line, k: 'halt', ref }
    case 'says':
    case 'say':
    case 'talks':
      c.eatWord('to') // speech bubble over the character
      return { line, k: 'speak', ref, expr: parseSayText(c) }
    case 'follows':
    case 'follow':
    case 'chases':
    case 'chase':
    case 'hunts':
      return parseChase(c, line, ref)
    case 'becomes':
    case 'become':
    case 'turns':
    case 'transforms':
    case 'changes': {
      c.eatWord('into', 'to')
      const { look } = parseLook(c, false)
      return { line, k: 'become', ref, ...look }
    }
    case 'grows':
    case 'grow':
    case 'shrinks':
    case 'shrink': {
      c.eatWord('by')
      const amount: Expr = c.done() ? { k: 'num', value: 10 } : parseExpr(c)
      return { line, k: 'grow', ref, amount, sign: verb.v.startsWith('shrink') ? -1 : 1 }
    }
    case 'disappears':
    case 'vanishes':
    case 'dies':
    case 'explodes':
      return { line, k: 'remove', ref }
    case 'hides':
      return { line, k: 'hide', ref }
    case 'shows':
    case 'appears':
      return { line, k: 'show', ref }
    case 'teleports':
    case 'jumps':
      c.eatWord('to')
      return { line, k: 'goto', ref, place: requirePlace(c) }
  }
  return fail(`I don't know what "${verb.v}" means here.`)
}

/** "👾 chases hero 2", "🐶 follows hero", "👾 moves toward hero at speed 1.5" */
function parseChase(c: Cursor, line: number, ref: Ref): Stmt {
  const target = parseRef(c)
  c.eatWord('at', 'with')
  c.eatWord('speed')
  const speed: Expr = c.done() ? { k: 'num', value: 2 } : parseExpr(c)
  c.eatWord('speed')
  return { line, k: 'chase', ref, target, speed }
}

function parseBackground(c: Cursor, line: number): Stmt {
  const t = c.next()
  if (t.t === 'emoji') return { line, k: 'background', color: null, emoji: t.v }
  if (t.t === 'word' && t.v in COLORS) return { line, k: 'background', color: t.v, emoji: null }
  return fail(`Try a color or an emoji, like \`background is green\` or \`background is 🌳\`.`)
}

function requirePlace(c: Cursor): Place {
  const p = parsePlace(c)
  if (!p) fail('Where? Try `center`, `top left`, `random place` or `100, 200`.')
  return p as Place
}

/** `say "hi"`, `say score`, or unquoted text like `say hello there` (forgiving). */
function parseSayText(c: Cursor): Expr {
  if (c.done()) return fail('What should it say? Put the words in quotes, like `say "Hello!"`.')
  const saved = c.i
  try {
    const e = parseExpr(c)
    if (c.done()) return e
  } catch {
    /* fall through to raw text */
  }
  c.i = saved
  const words: string[] = []
  while (!c.done()) words.push(c.next().v)
  return { k: 'str', value: words.join(' ') }
}

// ---------------------------------------------------------------------------
// Block headers

function parseHeader(toks: Tok[], body: Stmt[], line: number, depth: number): Stmt {
  const c = new Cursor(toks)
  const first = c.peek() as Tok
  let stmt: Stmt
  switch (first.v) {
    case 'forever':
    case 'always':
      c.i++
      stmt = { line, k: 'forever', body }
      break
    case 'repeat':
    case 'loop':
      c.i++
      if (c.eatWord('forever')) {
        stmt = { line, k: 'forever', body }
        break
      }
      stmt = { line, k: 'repeat', count: parseExpr(c), body }
      c.eatWord('time')
      break
    case 'if':
      c.i++
      stmt = { line, k: 'if', cond: parseCond(c), body, otherwise: null }
      break
    case 'every':
    case 'each': {
      c.i++
      const seconds: Expr = c.isWord('second') ? { k: 'num', value: 1 } : parseExpr(c)
      if (!c.eatWord('second')) fail('Write it like this: `every 2 second:`.')
      stmt = { line, k: 'every', seconds, body }
      break
    }
    case 'when':
    case 'whenever':
      c.i++
      if (depth > 0) fail('"when" steps can\'t go inside another block — move this line all the way to the left.')
      stmt = parseWhen(c, body, line)
      break
    default:
      return fail(`I don't know how to start a block with "${first.v}".`)
  }
  c.expectEnd()
  return stmt
}

function parseWhen(c: Cursor, body: Stmt[], line: number): Stmt {
  if (c.isWord('game', 'program', 'it') && c.isWordAt(1, 'starts', 'start', 'begins')) {
    c.i += 2
    return { line, k: 'whenStart', body }
  }
  if (c.eatWord('i', 'you', 'someone', 'user', 'player')) {
    if (c.eatWord('click', 'clicks', 'tap', 'taps')) {
      c.eatWord('on')
      return { line, k: 'whenClick', ref: parseRef(c), body }
    }
    if (c.eatWord('press', 'presses', 'hit', 'hits')) {
      c.eatWord('key')
      const t = c.next()
      if (!KEY_NAMES.has(t.v)) fail(`I don't know the key "${t.v}". Try left, right, up, down, space, enter or a letter.`)
      c.eatWord('key')
      return { line, k: 'whenKey', key: t.v, body }
    }
    fail('Try `when I click ball:` or `when I press space:`.')
  }
  const key = parseKeyCond(c)
  if (key) return { line, k: 'whenKey', key, body }

  const ref = parseRef(c)
  if (c.eatWord('is', 'gets')) {
    if (c.eatWord('clicked', 'tapped')) return { line, k: 'whenClick', ref, body }
    if (c.isWord(...TOUCH_VERBS)) {
      /* "is touching" — handled below */
    } else fail('Try `when ball is clicked:` or `when ball touches star:`.')
  }
  if (c.eatWord('clicked', 'tapped')) return { line, k: 'whenClick', ref, body }
  if (c.isWord(...TOUCH_VERBS)) {
    c.i++
    c.eatWord('with', 'into')
    const side = parseSide(c)
    if (side) return { line, k: 'whenEdge', ref, side, body }
    return { line, k: 'whenTouch', a: ref, b: parseRef(c), body }
  }
  if (c.eatWord('goes', 'falls', 'moves', 'flies')) {
    if (c.eatWord('off', 'out')) {
      c.eatWord('of')
      const side = parseSide(c) ?? 'any'
      return { line, k: 'whenEdge', ref, side, body }
    }
  }
  return fail('I don\'t know this kind of "when". Try `when left key is pressed:`, `when ball touches star:` or `when ball hits edge:`.')
}

/** "edge", "bottom edge", "the top", "left wall" → a side; null if not an edge. */
function parseSide(c: Cursor): Side | null {
  const t = c.peek()
  if (!t || t.t !== 'word') return null
  if (SIDES[t.v] && !isNameTok(c.peek(1))) {
    c.i++
    while (c.isWord(...EDGE_WORDS) || c.isWord('of')) c.i++
    return SIDES[t.v]
  }
  if (EDGE_WORDS.has(t.v)) {
    while (c.isWord(...EDGE_WORDS) || c.isWord('of')) c.i++
    return 'any'
  }
  return null
}

// ---------------------------------------------------------------------------
// Lines → blocks

interface Line {
  line: number
  indent: number
  toks: Tok[]
}

interface Node {
  src: Line
  header: Tok[] | null
  inline: Tok[] | null
  children: Node[]
}

function splitHeader(toks: Tok[]): { header: Tok[]; inline: Tok[] | null } | null {
  const first = toks[0]
  if (!first || first.t !== 'word' || !BLOCK_STARTERS.has(first.v)) return null
  let idx = toks.findIndex((t) => t.t === 'sym' && t.v === ':')
  if (idx < 0) idx = toks.findIndex((t) => t.t === 'word' && (t.v === 'then' || t.v === 'do'))
  if (idx < 0) {
    // "forever" / "otherwise" alone on a line still opens a block
    if (toks.length === 1 && ['forever', 'always', 'otherwise'].includes(first.v)) return { header: toks, inline: null }
    return null
  }
  const inline = toks.slice(idx + 1)
  return { header: toks.slice(0, idx), inline: inline.length ? inline : null }
}

function buildTree(source: string): Node[] {
  const root: Node[] = []
  const stack: { indent: number; children: Node[] }[] = [{ indent: -1, children: root }]
  source.split(/\r?\n/).forEach((rawLine, i) => {
    const text = stripComment(rawLine)
    if (!text.trim()) return
    const indent = (text.match(/^[ \t]*/)?.[0] ?? '').replace(/\t/g, '    ').length
    const toks = tokenize(text)
    if (!toks.length) return
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop()
    const split = splitHeader(toks)
    const node: Node = { src: { line: i + 1, indent, toks }, header: split?.header ?? null, inline: split?.inline ?? null, children: [] }
    stack[stack.length - 1].children.push(node)
    if (node.header && !node.inline) stack.push({ indent, children: node.children })
  })
  return root
}

// ---------------------------------------------------------------------------
// Whole program

export function parse(source: string): ParseResult {
  const errors: SayntaxError[] = []
  const tree = buildTree(source)
  const known = collectNames(tree)
  const elseIfs = new WeakSet<Stmt>()

  const parseNodes = (nodes: Node[], depth: number): Stmt[] => {
    const out: Stmt[] = []
    for (const node of nodes) {
      const line = node.src.line
      try {
        if (!node.header) {
          out.push(parseSimple(node.src.toks, line))
          continue
        }
        if (!node.inline && node.children.length === 0) {
          fail('This block is empty — add the steps that belong to it on the lines below, indented.')
        }
        const body = node.inline ? [parseSimple(node.inline, line)] : parseNodes(node.children, depth + 1)
        if (node.header[0].v === 'otherwise') {
          const target = openIf(out, elseIfs)
          const rest = node.header.slice(1)
          if (rest.length && rest[0].v === 'if') {
            const elseIf = parseHeader(rest, body, line, depth)
            elseIfs.add(elseIf)
            if (target.k === 'if') target.otherwise = [elseIf]
          } else {
            if (rest.length) fail(`I didn't expect "${rest[0].v}" after "otherwise".`)
            if (target.k === 'if') target.otherwise = body
          }
          continue
        }
        out.push(parseHeader(node.header, body, line, depth))
      } catch (e) {
        if (!(e instanceof ParseFail)) throw e
        errors.push({ line, message: friendlier(node.src.toks, known, e.message) })
      }
    }
    return out
  }

  const body = parseNodes(tree, 0)
  if (errors.length) return { program: null, errors: sortErrors(errors) }

  const program = buildProgram(body)
  errors.push(...checkNames(program))
  return errors.length ? { program: null, errors: sortErrors(errors) } : { program, errors: [] }
}

const sortErrors = (errors: SayntaxError[]) => errors.sort((a, b) => a.line - b.line)

function openIf(out: Stmt[], elseIfs: WeakSet<Stmt>): Stmt {
  let s = out[out.length - 1]
  if (!s || s.k !== 'if') return fail('"otherwise" needs an "if" right above it.')
  while (s.k === 'if' && s.otherwise) {
    const only: Stmt | null = s.otherwise.length === 1 ? s.otherwise[0] : null
    if (only && elseIfs.has(only)) s = only
    else return fail('This "if" already has an "otherwise".')
  }
  return s
}

/** Replaces a generic error with "did you mean …?" when a word looks like a typo. */
function friendlier(toks: Tok[], known: Set<string>, message: string): string {
  const candidates = [...KEYWORDS, ...known]
  for (const t of toks) {
    if (t.t !== 'word' || t.v.length < 3) continue
    if (RESERVED.has(t.v) || known.has(t.v) || t.v in COLORS || t.v in SHAPES || t.v in SIZE_WORDS || t.v in DIRECTIONS) continue
    if (KEY_NAMES.has(t.v) || EDGE_WORDS.has(t.v) || TOUCH_VERBS.has(t.v)) continue
    const guess = closest(t.v, candidates)
    if (guess) return `I don't know "${t.v}" — did you mean "${guess}"?`
  }
  return message
}

/** A quick scan of every name the program defines, so typo hints can suggest them. */
function collectNames(tree: Node[]): Set<string> {
  const names = new Set<string>()
  const visit = (nodes: Node[]) => {
    for (const n of nodes) {
      const toks = n.src.toks
      toks.forEach((t, i) => {
        if (t.t === 'emoji') names.add(t.v)
        const next = toks[i + 1]
        if (i === 0 && isNameTok(t) && next?.t === 'word' && next.v === 'is') names.add(t.v)
        if (t.t === 'word' && ['set', 'make', 'into', 'increase', 'decrease'].includes(t.v) && isNameTok(next)) names.add(next!.v)
      })
      visit(n.children)
    }
  }
  visit(tree)
  return names
}

function walk(stmts: Stmt[], fn: (s: Stmt) => void): void {
  for (const s of stmts) {
    fn(s)
    if ('body' in s) walk(s.body, fn)
    if (s.k === 'if' && s.otherwise) walk(s.otherwise, fn)
  }
}

function buildProgram(body: Stmt[]): Program {
  const looks: Record<string, ThingLook> = {}
  const vars = new Set<string>()
  walk(body, (s) => {
    if (s.k === 'thing' && !looks[s.name]) {
      looks[s.name] = { color: s.color, shape: s.shape, emoji: s.emoji, size: s.size, sprite: s.sprite ?? null }
    }
    if (s.k === 'set' || s.k === 'change' || s.k === 'ask') vars.add(s.name)
  })
  // Emoji (and common words like "star") can be used without describing them first.
  const autoLook = (name: string | null) => {
    if (!name || looks[name]) return
    if (/\p{Extended_Pictographic}/u.test(name)) looks[name] = { color: null, shape: null, emoji: name, size: null }
    else if (isSprite(name)) looks[name] = { color: null, shape: null, emoji: null, size: null, sprite: name }
  }
  walk(body, (s) => {
    if (s.k === 'make') {
      autoLook(s.name)
      if (!looks[s.name] && EMOJI_FOR_WORD[s.name]) {
        looks[s.name] = { color: null, shape: null, emoji: EMOJI_FOR_WORD[s.name], size: null }
      }
    }
    forEachRef(s, (r) => autoLook(r.name))
  })
  return { body, looks, vars: [...vars] }
}

function forEachRef(s: Stmt, fn: (r: Ref) => void): void {
  if ('ref' in s) fn(s.ref)
  if (s.k === 'chase') fn(s.target)
  if (s.k === 'whenTouch') {
    fn(s.a)
    fn(s.b)
  }
  if (s.k === 'if') forEachCondRef(s.cond, fn)
}

function forEachCondRef(c: Cond, fn: (r: Ref) => void): void {
  if (c.k === 'touches') {
    fn(c.a)
    fn(c.b)
  } else if (c.k === 'and' || c.k === 'or') {
    forEachCondRef(c.left, fn)
    forEachCondRef(c.right, fn)
  }
}

function forEachExpr(s: Stmt, fn: (e: Expr) => void): void {
  const visitExpr = (e: Expr): void => {
    fn(e)
    if (e.k === 'bin') {
      visitExpr(e.left)
      visitExpr(e.right)
    } else if (e.k === 'random') {
      visitExpr(e.min)
      visitExpr(e.max)
    }
  }
  const visitCond = (c: Cond): void => {
    if (c.k === 'cmp') {
      visitExpr(c.left)
      visitExpr(c.right)
    } else if (c.k === 'and' || c.k === 'or') {
      visitCond(c.left)
      visitCond(c.right)
    }
  }
  switch (s.k) {
    case 'set':
    case 'change':
      visitExpr(s.expr)
      break
    case 'say':
    case 'label':
    case 'speak':
      visitExpr(s.expr)
      break
    case 'chase':
      visitExpr(s.speed)
      break
    case 'grow':
      visitExpr(s.amount)
      break
    case 'ask':
      visitExpr(s.prompt)
      break
    case 'move':
      visitExpr(s.amount)
      break
    case 'moves':
      visitExpr(s.speed)
      break
    case 'repeat':
      visitExpr(s.count)
      break
    case 'every':
    case 'wait':
      visitExpr(s.seconds)
      break
    case 'if':
      visitCond(s.cond)
      break
  }
}

/** Every character and variable used must exist; plurals ("stars") are fixed up quietly. */
function checkNames(program: Program): SayntaxError[] {
  const errors: SayntaxError[] = []
  const kinds = new Set(Object.keys(program.looks))
  const vars = new Set(program.vars)
  const singular = (name: string, pool: Set<string>): string | null => {
    if (pool.has(name)) return name
    if (name.endsWith('s') && pool.has(name.slice(0, -1))) return name.slice(0, -1)
    if (name.endsWith('es') && pool.has(name.slice(0, -2))) return name.slice(0, -2)
    return null
  }
  walk(program.body, (s) => {
    if (s.k === 'make' && !kinds.has(s.name)) {
      const fixed = singular(s.name, kinds)
      if (fixed) s.name = fixed
      else errors.push({ line: s.line, message: unknownThing(s.name, kinds, vars) })
    }
    forEachRef(s, (r) => {
      if (!r.name) return
      const fixed = singular(r.name, kinds)
      if (fixed) r.name = fixed
      else errors.push({ line: s.line, message: unknownThing(r.name, kinds, vars) })
    })
    forEachExpr(s, (e) => {
      if (e.k !== 'var') return
      const fixed = singular(e.name, vars)
      if (fixed) e.name = fixed
      else if (kinds.has(e.name)) errors.push({ line: s.line, message: `"${e.name}" is a character, not a number or text.` })
      else {
        const guess = closest(e.name, vars)
        errors.push({
          line: s.line,
          message: guess
            ? `I don't know "${e.name}" — did you mean "${guess}"?`
            : `I don't know what "${e.name}" is yet. Give it a value first, like \`${e.name} is 0\`.`,
        })
      }
    })
  })
  return errors
}

function unknownThing(name: string, kinds: Set<string>, vars: Set<string>): string {
  if (vars.has(name)) return `"${name}" is a number or text, not a character.`
  const guess = closest(name, kinds)
  if (guess) return `I don't know "${name}" — did you mean "${guess}"?`
  return `I don't know what "${name}" looks like yet. Describe it first, like \`${name} is a blue circle\`.`
}
