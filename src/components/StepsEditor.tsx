// The notebook. The textarea sits on top with invisible text; the lines underneath draw the
// real text so tidy lines can be in ink, your own words in pencil, and changes highlighted.
// Word-bank stickers can be dragged in: a dashed preview shows where they will land.

import { useRef, useState, type DragEvent, type RefObject } from 'react'
import { insertSnippet } from '../lang/insert'

export const STICKER_MIME = 'application/x-sayntax-sticker'

interface Props {
  value: string
  onChange(value: string): void
  highlighted: Set<number>
  /** Changes whenever new lines are highlighted, so the highlighter swipe replays. */
  highlightRun: number
  messyLines: Set<number>
  errorLines: Set<number>
  inputRef: RefObject<HTMLTextAreaElement>
  /** The sticker being dragged from the word bank, if any. */
  dragging: string | null
  /** A sticker was dropped before line index `at` (0-based). */
  onDropSnippet(snippet: string, at: number): void
}

export function StepsEditor(props: Props) {
  const { value, onChange, highlighted, highlightRun, messyLines, errorLines, inputRef, dragging, onDropSnippet } = props
  const page = useRef<HTMLDivElement>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)
  const lines = value.split('\n')

  // While a sticker hovers over the page, show the program as it would look after the drop.
  const preview = dragging !== null && dropAt !== null ? insertSnippet(value, dragging, dropAt) : null
  const shown = preview ? preview.source.split('\n') : lines
  const ghost = new Set(preview?.lines ?? [])
  const ruled = Math.max(shown.length + 4, 14)

  /** Which gap between lines the pointer is over. */
  const gapAt = (e: DragEvent): number => {
    const el = page.current
    const first = el?.querySelector('.page-line') as HTMLElement | null
    if (!el || !first) return lines.length
    const lineHeight = first.offsetHeight || 34
    const rect = el.getBoundingClientRect()
    const y = e.clientY - rect.top - first.offsetTop + el.scrollTop
    return Math.max(0, Math.min(lines.length, Math.floor(y / lineHeight + 0.5)))
  }

  const isSticker = (e: DragEvent) => e.dataTransfer.types.includes(STICKER_MIME)

  return (
    <div
      className={`notebook-page${preview ? ' drop-target' : ''}`}
      onDragOver={(e) => {
        if (!isSticker(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        const at = gapAt(e)
        if (at !== dropAt) setDropAt(at)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropAt(null)
      }}
      onDrop={(e) => {
        if (!isSticker(e)) return
        e.preventDefault() // stop the textarea from pasting the text itself
        const snippet = e.dataTransfer.getData(STICKER_MIME)
        const at = gapAt(e)
        setDropAt(null)
        if (snippet) onDropSnippet(snippet, at)
      }}
    >
      <div className="page-lines" ref={page} aria-hidden>
        {Array.from({ length: ruled }, (_, i) => {
          if (i >= shown.length) {
            return (
              <div key={`blank-${i}`} className="page-line">
                <span className="line-text"> </span>
              </div>
            )
          }
          const text = shown[i]
          const n = i + 1
          if (ghost.has(n)) {
            return (
              <div key={`ghost-${i}`} className="page-line ghost">
                <span className="margin-num">+</span>
                <span className="line-text">{text || ' '}</span>
              </div>
            )
          }
          // Map back to the real line number so markers stay on the right lines during a preview.
          const real = preview && n > preview.lines[0] ? n - preview.lines.length : n
          const kind = errorLines.has(real) ? 'error' : messyLines.has(real) ? 'pencil' : 'ink'
          const marked = !preview && highlighted.has(real)
          return (
            <div key={`${i}-${marked ? highlightRun : 0}`} className={`page-line ${kind}${marked ? ' marked' : ''}`}>
              <span className="margin-num">
                {errorLines.has(real) ? <span className="margin-bang">!</span> : messyLines.has(real) ? '✏️' : real}
              </span>
              <span className="line-text">{text || ' '}</span>
            </div>
          )
        })}
      </div>
      <textarea
        ref={inputRef}
        className="page-input"
        value={value}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-label="Your game. Write Sayntax steps or your own words."
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => {
          if (!page.current) return
          page.current.scrollTop = e.currentTarget.scrollTop
          page.current.scrollLeft = e.currentTarget.scrollLeft
        }}
        onKeyDown={(e) => {
          // Tab writes 4 spaces instead of jumping out of the notebook.
          if (e.key === 'Tab' && !e.shiftKey) {
            e.preventDefault()
            const el = e.currentTarget
            const { selectionStart: s, selectionEnd: end } = el
            onChange(el.value.slice(0, s) + '    ' + el.value.slice(end))
            requestAnimationFrame(() => el.setSelectionRange(s + 4, s + 4))
          }
        }}
      />
    </div>
  )
}
