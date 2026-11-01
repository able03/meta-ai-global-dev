// Helpers shared by the app and the server for "tidying" a program:
// find the lines Sayntax can't read, fix simple typos for free, and build cache keys.

import { parse } from './parser.js'

/** Bump when the prompt changes, so old cached answers are not reused. */
export const TIDY_VERSION = 'v1'

/** Line numbers (1-based) that Sayntax can't read yet. */
export function messyLines(source: string): number[] {
  return [...new Set(parse(source).errors.map((e) => e.line))].filter((n) => n > 0)
}

const DID_YOU_MEAN = /I don't know "([^"]+)" — did you mean "([^"]+)"\?/

/**
 * Fixes typos the parser already knows how to fix ("bouce" → "bounces"), with no AI.
 * A fix is kept only if it makes that line readable.
 */
export function autocorrect(source: string): { source: string; fixes: { line: number; from: string; to: string }[] } {
  let current = source
  const fixes: { line: number; from: string; to: string }[] = []
  const tried = new Set<string>()
  for (let round = 0; round < 20; round++) {
    const candidate = parse(current)
      .errors.map((e) => ({ e, m: e.message.match(DID_YOU_MEAN) }))
      .find(({ e, m }) => m && !tried.has(`${e.line}:${m[1]}`))
    if (!candidate) break
    const { e, m } = candidate
    const [, from, to] = m!
    tried.add(`${e.line}:${from}`)
    const lines = current.split('\n')
    const original = lines[e.line - 1]
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeRegExp(from)}(?=$|[^\\p{L}\\p{N}_])`, 'iu')
    const replaced = original.replace(pattern, (_, before: string) => before + to)
    if (replaced === original) continue
    lines[e.line - 1] = replaced
    const next = lines.join('\n')
    // Only keep a fix that makes the whole line readable — otherwise it's a sentence for the AI.
    if (!parse(next).errors.some((x) => x.line === e.line)) {
      current = next
      fixes.push({ line: e.line, from, to })
    }
  }
  return { source: current, fixes }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Makes small differences (case, spaces, trailing punctuation, comments) share one cache entry. */
export function normalizeForCache(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) =>
      line
        .replace(/\t/g, '    ')
        .replace(/\s+$/, '')
        .replace(/[.!?;]+$/, '')
        .replace(/(\S)\s{2,}/g, '$1 ')
        .toLowerCase(),
    )
    .filter((line) => line.trim() !== '' && !line.trim().startsWith('#'))
    .join('\n')
}

export async function cacheKey(source: string): Promise<string> {
  const data = new TextEncoder().encode(`${TIDY_VERSION}\n${normalizeForCache(source)}`)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Lines in `after` that are new compared with `before` — used to glow what the AI changed. */
export function changedLines(before: string, after: string): number[] {
  const old = new Set(before.split('\n').map((l) => l.trim()))
  return after
    .split('\n')
    .map((l, i) => (l.trim() && !old.has(l.trim()) ? i + 1 : 0))
    .filter(Boolean)
}
