// The one editor: line numbers, ✨ on lines that will be tidied, glow on lines the AI just wrote.

import { useRef } from 'react'

interface Props {
  value: string
  onChange(value: string): void
  highlighted: Set<number>
  messyLines: Set<number>
  errorLines: Set<number>
}

export function StepsEditor({ value, onChange, highlighted, messyLines, errorLines }: Props) {
  const backdrop = useRef<HTMLDivElement>(null)
  const lines = value.split('\n')

  return (
    <div className="steps-editor">
      <div className="steps-backdrop" ref={backdrop} aria-hidden>
        {lines.map((_, i) => {
          const n = i + 1
          const cls = errorLines.has(n) ? 'row error' : messyLines.has(n) ? 'row messy' : highlighted.has(n) ? 'row active' : 'row'
          return (
            <div key={i} className={cls}>
              <span className="gutter">{messyLines.has(n) ? '✨' : n}</span>
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
        aria-label="Your game, in Sayntax or your own words"
        placeholder="a cat that catches falling fish when I press the arrow keys"
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => {
          if (backdrop.current) backdrop.current.scrollTop = e.currentTarget.scrollTop
        }}
        onKeyDown={(e) => {
          // Tab inserts 4 spaces instead of leaving the editor.
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
