// Read-only Python view. Lines from the selected Step glow; hovering explains a line in plain English.

import { useState } from 'react'
import type { PyLine } from '../lang/python'

interface Props {
  lines: PyLine[]
  highlighted: Set<number>
  onSelectStep(line: number): void
}

export function CodeView({ lines, highlighted, onSelectStep }: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const explain = hover !== null ? lines[hover]?.explain : ''

  if (!lines.length) return <p className="empty">Your Python will appear here once your Steps have no mistakes.</p>

  return (
    <div className="code-view">
      <pre className="code-lines">
        {lines.map((l, i) => (
          <div
            key={i}
            className={`code-row${l.src !== null && highlighted.has(l.src) ? ' active' : ''}${l.src !== null ? ' linked' : ''}`}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onClick={() => l.src !== null && onSelectStep(l.src)}
          >
            <span className="gutter">{i + 1}</span>
            <code>{l.text || ' '}</code>
          </div>
        ))}
      </pre>
      <div className="explain" aria-live="polite">
        {explain ? <>💡 {explain}</> : <span className="muted">Hover a line to see what it does. Click it to find its Step.</span>}
      </div>
    </div>
  )
}
