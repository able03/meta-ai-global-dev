// The notebook. The textarea sits on top with invisible text; the lines underneath draw the
// real text so tidy lines can be in ink, your own words in pencil, and changes highlighted.

import { useRef, type RefObject } from 'react'

interface Props {
  value: string
  onChange(value: string): void
  highlighted: Set<number>
  /** Changes whenever new lines are highlighted, so the highlighter swipe replays. */
  highlightRun: number
  messyLines: Set<number>
  errorLines: Set<number>
  inputRef: RefObject<HTMLTextAreaElement>
}

export function StepsEditor({ value, onChange, highlighted, highlightRun, messyLines, errorLines, inputRef }: Props) {
  const page = useRef<HTMLDivElement>(null)
  const lines = value.split('\n')
  // Extra empty ruled lines so the page always looks like a full notebook page.
  const ruled = Math.max(lines.length + 4, 14)

  return (
    <div className="notebook-page">
      <div className="page-lines" ref={page} aria-hidden>
        {Array.from({ length: ruled }, (_, i) => {
          if (i >= lines.length) {
            return (
              <div key={`blank-${i}`} className="page-line">
                <span className="line-text"> </span>
              </div>
            )
          }
          const text = lines[i]
          const n = i + 1
          const kind = errorLines.has(n) ? 'error' : messyLines.has(n) ? 'pencil' : 'ink'
          const marked = highlighted.has(n)
          return (
            <div key={`${i}-${marked ? highlightRun : 0}`} className={`page-line ${kind}${marked ? ' marked' : ''}`}>
              <span className="margin-num">{messyLines.has(n) ? '✏️' : n}</span>
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
