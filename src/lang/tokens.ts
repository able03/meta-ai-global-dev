// Turns one line of Sayntax into tokens, forgiving the way beginners type.

export type TokType = 'word' | 'num' | 'str' | 'emoji' | 'sym'

export interface Tok {
  t: TokType
  v: string
}

const TOKEN_RE =
  /"([^"]*)"|(\d+(?:\.\d+)?)|(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{EMod})*️?)|([\p{L}\p{M}\p{N}_](?:[\p{L}\p{M}\p{N}_-]*[\p{L}\p{M}\p{N}_])?)|(>=|<=|!=|[,:+\-*/<>=()])/gu

/** Words that carry no meaning in Sayntax, so beginners can write naturally. */
const FILLERS = new Set(['the', 'a', 'an', 'please'])

/** One-word synonyms mapped to the standard word. */
const SYNONYMS: Record<string, string> = {
  arrow: 'key',
  seconds: 'second',
  secs: 'second',
  sec: 'second',
  times: 'time',
  else: 'otherwise',
  print: 'say',
  delete: 'remove',
  destroy: 'remove',
  erase: 'remove',
  create: 'make',
  spawn: 'make',
  middle: 'center',
  centre: 'center',
  grey: 'gray',
}

export function normalizeLine(raw: string): string {
  return raw
    .replace(/[“”„]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/→|->|=>/g, ':')
}

export function tokenize(raw: string): Tok[] {
  const line = normalizeLine(raw)
  const toks: Tok[] = []
  for (const m of line.matchAll(TOKEN_RE)) {
    if (m[1] !== undefined) toks.push({ t: 'str', v: m[1] })
    else if (m[2] !== undefined) toks.push({ t: 'num', v: m[2] })
    else if (m[3] !== undefined) toks.push({ t: 'emoji', v: m[3] })
    else if (m[4] !== undefined) {
      const lower = m[4].toLowerCase()
      if (FILLERS.has(lower)) continue
      toks.push({ t: 'word', v: SYNONYMS[lower] ?? lower })
    } else if (m[5] !== undefined) toks.push({ t: 'sym', v: m[5] })
  }
  return toks
}

/** Strips a `# comment` that is not inside quotes. */
export function stripComment(line: string): string {
  let inStr = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"' || ch === '“' || ch === '”') inStr = !inStr
    else if (ch === '#' && !inStr) return line.slice(0, i)
  }
  return line
}
