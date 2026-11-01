// The vocabulary of Sayntax: colors, shapes, keys, directions and friendly names for emoji.

import type { Direction, Shape, Side } from './ast.js'

export const COLORS: Record<string, string> = {
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#facc15',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#a855f7',
  pink: '#ec4899',
  black: '#111827',
  white: '#f9fafb',
  gray: '#9ca3af',
  brown: '#92400e',
  gold: '#eab308',
  cyan: '#06b6d4',
}

export const SHAPES: Record<string, Shape> = {
  circle: 'circle',
  ball: 'circle',
  dot: 'circle',
  square: 'square',
  box: 'square',
  block: 'square',
  rectangle: 'square',
  triangle: 'triangle',
}

export const SIZE_WORDS: Record<string, number> = {
  tiny: 16,
  small: 28,
  big: 70,
  large: 70,
  huge: 110,
  giant: 110,
}

export const DIRECTIONS: Record<string, Direction> = {
  up: 'up',
  down: 'down',
  left: 'left',
  right: 'right',
  'up-left': 'up-left',
  upleft: 'up-left',
  'up-right': 'up-right',
  upright: 'up-right',
  'down-left': 'down-left',
  downleft: 'down-left',
  'down-right': 'down-right',
  downright: 'down-right',
  diagonally: 'down-right',
  randomly: 'random',
  around: 'random',
}

export const SIDES: Record<string, Side> = {
  top: 'top',
  bottom: 'bottom',
  left: 'left',
  right: 'right',
}

export const EDGE_WORDS = new Set(['edge', 'edges', 'wall', 'walls', 'side', 'sides', 'border', 'screen'])

export const TOUCH_VERBS = new Set([
  'touches',
  'touch',
  'touching',
  'hits',
  'hit',
  'collides',
  'bumps',
  'meets',
  'reaches',
  'catches',
])

const LETTERS = 'bcdefghijklmnopqrstuvwxyz'.split('')
export const KEY_NAMES = new Set(['left', 'right', 'up', 'down', 'space', 'enter', ...LETTERS, ...'0123456789'.split('')])
/** Keys that repeat while held down (smooth movement). Other keys fire once per press. */
export const HELD_KEYS = new Set(['left', 'right', 'up', 'down'])

/** Lets `make a star` work without defining what a star looks like first. */
export const EMOJI_FOR_WORD: Record<string, string> = {
  star: '⭐',
  cat: '🐱',
  dog: '🐶',
  mouse: '🐭',
  fish: '🐟',
  bird: '🐦',
  apple: '🍎',
  heart: '❤️',
  rocket: '🚀',
  alien: '👾',
  ghost: '👻',
  car: '🚗',
  tree: '🌳',
  sun: '☀️',
  moon: '🌙',
  cloud: '☁️',
  coin: '🪙',
  bomb: '💣',
  rock: '🪨',
  basket: '🧺',
  frog: '🐸',
  monkey: '🐵',
  banana: '🍌',
  bee: '🐝',
  flower: '🌸',
  fire: '🔥',
  snowflake: '❄️',
  football: '⚽',
  soccer: '⚽',
}

/** Readable names for emoji, used when generating Python. */
export const WORD_FOR_EMOJI: Record<string, string> = Object.fromEntries(
  Object.entries(EMOJI_FOR_WORD).map(([w, e]) => [e, w]),
)

/** Every word Sayntax understands — used for "did you mean …?" hints. */
export const KEYWORDS = [
  'say', 'ask', 'into', 'wait', 'second', 'stop', 'make', 'remove', 'hide', 'show', 'move', 'put',
  'set', 'add', 'subtract', 'from', 'increase', 'decrease', 'change', 'bounce', 'bounces', 'moves',
  'goes', 'falls', 'rises', 'stops', 'says', 'disappears', 'forever', 'repeat', 'time', 'if',
  'otherwise', 'every', 'when', 'key', 'pressed', 'touches', 'hits', 'edge', 'clicked', 'size',
  'random', 'more', 'less', 'than', 'least', 'most', 'center', 'speed', 'that', 'starts',
  ...Object.keys(COLORS),
  ...Object.keys(SHAPES),
  ...Object.keys(SIZE_WORDS),
  ...Object.keys(DIRECTIONS),
  ...Object.keys(SIDES),
]

export function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return dp[b.length]
}

/** The closest known word, if it's close enough to be a likely typo. */
export function closest(word: string, candidates: Iterable<string>): string | null {
  let best: string | null = null
  let bestDist = Infinity
  for (const c of candidates) {
    if (c === word) continue
    const d = levenshtein(word, c)
    if (d < bestDist) {
      bestDist = d
      best = c
    }
  }
  const allowed = word.length <= 4 ? 1 : 2
  return bestDist <= allowed ? best : null
}
