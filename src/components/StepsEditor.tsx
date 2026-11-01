// A code editor for Steps: line numbers, error lines, and highlight for the selected / linked lines.

import { useRef } from 'react'

interface Props {
  value: string
  onChange(value: string): void
  highlighted: Set<number>
  errorLines: Set<number>
  onCursorLine(line: number): void
}

export function StepsEditor({ value, onChange, highlighted, errorLines, onCursorLine }: Props) {
  const backdrop = useRef<HTMLDivElement>(null)
  const lines = value.split('\n')

  const reportCursor = (el: HTMLTextAreaElement) => {
    const line = el.value.slice(0, el.selectionStart).split('\n').length
    onCursorLine(line)
  }

  return (
    <div className="steps-editor">
      <div className="steps-backdrop" ref={backdrop} aria-hidden>
        {lines.map((_, i) => {
          const n = i + 1
          const cls = errorLines.has(n) ? 'row error' : highlighted.has(n) ? 'row active' : 'row'
          return (
            <div key={i} className={cls}>
              <span className="gutter">{n}</span>
            </div>
          )
        })}
      </div>
      <textarea
        className="steps-input"
        value={value}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-label="Steps (Sayntax source code)"
        placeholder={'ball is a red circle at center\nball moves down-right 5\nball bounces'}
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => {
          if (backdrop.current) backdrop.current.scrollTop = e.currentTarget.scrollTop
        }}
        onClick={(e) => reportCursor(e.currentTarget)}
        onKeyUp={(e) => reportCursor(e.currentTarget)}
        onKeyDown={(e) => {
          // Tab inserts 4 spaces instead of leaving the editor.
          if (e.key === 'Tab' && !e.shiftKey) {
            e.preventDefault()
            const el = e.currentTarget
            const { selectionStart: s, selectionEnd: end } = el
            const next = el.value.slice(0, s) + '    ' + el.value.slice(end)
            onChange(next)
            requestAnimationFrame(() => el.setSelectionRange(s + 4, s + 4))
          }
        }}
      />
    </div>
  )
}
