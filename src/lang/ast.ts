// The shape of a parsed Sayntax program.

export const STAGE = { width: 800, height: 500 } as const
export const DEFAULT_SIZE = 40

export type PosSpec =
  | { kind: 'num'; value: number }
  | { kind: 'random' }
  | { kind: 'min' }
  | { kind: 'mid' }
  | { kind: 'max' }

export interface Place {
  x: PosSpec
  y: PosSpec
}

export type Direction =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'up-left'
  | 'up-right'
  | 'down-left'
  | 'down-right'
  | 'random'

export type Shape = 'circle' | 'square' | 'triangle'

export type Side = 'any' | 'top' | 'bottom' | 'left' | 'right'

/** A reference to a character: `ball`, `that ⭐`, or `it` (name null). */
export interface Ref {
  name: string | null
  that: boolean
}

export type Expr =
  | { k: 'num'; value: number }
  | { k: 'str'; value: string }
  | { k: 'var'; name: string }
  | { k: 'random'; min: Expr; max: Expr }
  | { k: 'bin'; op: '+' | '-' | '*' | '/'; left: Expr; right: Expr }

export type CmpOp = '=' | '!=' | '>' | '<' | '>=' | '<='

export type Cond =
  | { k: 'cmp'; op: CmpOp; left: Expr; right: Expr }
  | { k: 'touches'; a: Ref; b: Ref }
  | { k: 'key'; key: string }
  | { k: 'and' | 'or'; left: Cond; right: Cond }

export interface ThingLook {
  color: string | null
  shape: Shape | null
  emoji: string | null
  size: number | null
  /** A ready-made pixel-art character, like "knight" or "slime". */
  sprite?: string | null
}

interface At {
  line: number
}

export type Stmt = At &
  (
    | ({ k: 'thing'; name: string; at: Place | null } & ThingLook)
    | { k: 'set'; name: string; expr: Expr }
    | { k: 'change'; name: string; expr: Expr; sign: 1 | -1 }
    | { k: 'make'; name: string; at: Place | null }
    | { k: 'remove' | 'hide' | 'show' | 'bounce' | 'halt'; ref: Ref }
    | { k: 'move'; ref: Ref; dir: Direction; amount: Expr }
    | { k: 'moves'; ref: Ref; dir: Direction; speed: Expr }
    | { k: 'goto'; ref: Ref; place: Place }
    | { k: 'say'; expr: Expr }
    // Building worlds (RPGs, adventures, anything)
    | { k: 'background'; color: string | null; emoji: string | null }
    | { k: 'solid'; ref: Ref }
    | { k: 'chase'; ref: Ref; target: Ref; speed: Expr }
    | { k: 'label'; expr: Expr; at: Place }
    | { k: 'speak'; ref: Ref; expr: Expr }
    | ({ k: 'become'; ref: Ref } & ThingLook)
    | { k: 'grow'; ref: Ref; amount: Expr; sign: 1 | -1 }
    | { k: 'sound'; name: string }
    | { k: 'ask'; prompt: Expr; name: string }
    | { k: 'forever'; body: Stmt[] }
    | { k: 'repeat'; count: Expr; body: Stmt[] }
    | { k: 'if'; cond: Cond; body: Stmt[]; otherwise: Stmt[] | null }
    | { k: 'every'; seconds: Expr; body: Stmt[] }
    | { k: 'wait'; seconds: Expr }
    | { k: 'stop' }
    | { k: 'whenKey'; key: string; body: Stmt[] }
    | { k: 'whenTouch'; a: Ref; b: Ref; body: Stmt[] }
    | { k: 'whenEdge'; ref: Ref; side: Side; body: Stmt[] }
    | { k: 'whenClick'; ref: Ref; body: Stmt[] }
    | { k: 'whenStart'; body: Stmt[] }
  )

export type StmtKind = Stmt['k']

export interface Program {
  body: Stmt[]
  /** How each character kind looks (from `x is a ...` lines, or an emoji used directly). */
  looks: Record<string, ThingLook>
  vars: string[]
}

export interface SayntaxError {
  line: number
  message: string
}

export interface ParseResult {
  program: Program | null
  errors: SayntaxError[]
}
