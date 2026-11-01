// Putting a word-bank sticker into a program at a given line, with sensible indentation.

export interface Insertion {
  source: string
  /** 1-based line numbers of the new lines. */
  lines: number[]
}

/**
 * Inserts `snippet` before line index `at` (0-based; `at === lines.length` means the end).
 * - Under a line ending in ":" the snippet goes inside that block (indented 4 more).
 * - Otherwise it lines up with the line above, so dropping inside a block stays inside it.
 * - "when …" events always go at the far left, because they can't be inside anything.
 */
export function insertSnippet(source: string, snippet: string, at: number): Insertion {
  const lines = source.split('\n')
  if (lines.length === 1 && lines[0].trim() === '') {
    const fresh = snippet.split('\n')
    return { source: snippet, lines: fresh.map((_, i) => i + 1) }
  }
  const index = Math.max(0, Math.min(at, lines.length))
  let indent = ''
  if (!/^\s*(when|whenever)\b/i.test(snippet)) {
    for (let i = index - 1; i >= 0; i--) {
      if (!lines[i].trim()) continue
      const own = lines[i].match(/^[ \t]*/)?.[0].replace(/\t/g, '    ') ?? ''
      indent = lines[i].trimEnd().endsWith(':') ? own + '    ' : own
      break
    }
  }
  const added = snippet.split('\n').map((l) => indent + l)
  const next = [...lines.slice(0, index), ...added, ...lines.slice(index)]
  return { source: next.join('\n'), lines: added.map((_, i) => index + i + 1) }
}
