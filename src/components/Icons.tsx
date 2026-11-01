// Hand-drawn style icons, so the controls look like part of the toy rather than stock emoji.

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 3,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function PlayIcon({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <path d="M13 8.5c0-1.6 1.7-2.5 3-1.7l16.5 11.4c1.2.8 1.2 2.6 0 3.4L16 33.2c-1.3.9-3-.1-3-1.7z" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** A fountain-pen nib: tidying rewrites your pencil words in ink. */
export function NibIcon({ size = 38 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <g {...base}>
        <path d="M20 4l9 13-9 19-9-19z" fill="currentColor" fillOpacity="0.15" />
        <path d="M20 17v11" />
        <circle cx="20" cy="15" r="2.4" fill="currentColor" />
        <path d="M14 12h12" />
      </g>
    </svg>
  )
}

export function ArrowIcon({ dir }: { dir: 'up' | 'down' | 'left' | 'right' }) {
  const rotate = { up: 0, right: 90, down: 180, left: 270 }[dir]
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden style={{ transform: `rotate(${rotate}deg)` }}>
      <path d="M10 4l6 9H4z" fill="currentColor" />
    </svg>
  )
}
