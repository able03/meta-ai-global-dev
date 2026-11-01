// Pencil doodles drifting across the desk behind everything.

const DOODLES = [
  // star
  'M25 3l6 15h16l-13 10 5 16-14-10-14 10 5-16L3 18h16z',
  // spiral
  'M30 30c0-4 6-4 6 0 0 8-12 8-12 0 0-12 18-12 18 0 0 16-24 16-24 0',
  // arrow
  'M5 40C15 20 30 15 45 12m0 0l-9-4m9 4l-6 8',
  // squiggle
  'M3 25c6-12 12 12 18 0s12 12 18 0 12 12 18 0',
  // triangle
  'M25 5L45 42H5z',
  // heart
  'M25 44S5 30 5 17C5 9 11 5 17 5c4 0 7 3 8 6 1-3 4-6 8-6 6 0 12 4 12 12 0 13-20 27-20 27z',
  // lightning
  'M28 3L10 28h14l-4 19 20-28H26z',
  // circle
  'M25 5a20 20 0 1 0 .1 0',
]

const PLACES = [
  { top: '8%', left: '4%', size: 54, delay: 0, d: 0 },
  { top: '62%', left: '2%', size: 46, delay: -12, d: 1 },
  { top: '84%', left: '22%', size: 60, delay: -24, d: 2 },
  { top: '12%', left: '46%', size: 40, delay: -6, d: 3 },
  { top: '78%', left: '56%', size: 52, delay: -18, d: 4 },
  { top: '6%', left: '86%', size: 48, delay: -30, d: 5 },
  { top: '46%', left: '93%', size: 44, delay: -9, d: 6 },
  { top: '90%', left: '88%', size: 50, delay: -21, d: 7 },
  { top: '36%', left: '30%', size: 36, delay: -15, d: 0 },
  { top: '52%', left: '70%', size: 38, delay: -27, d: 3 },
]

export function Doodles() {
  return (
    <div className="doodles" aria-hidden>
      {PLACES.map((p, i) => (
        <svg
          key={i}
          className="doodle"
          viewBox="0 0 50 50"
          width={p.size}
          height={p.size}
          style={{ top: p.top, left: p.left, animationDelay: `${p.delay}s` }}
        >
          <path d={DOODLES[p.d]} />
        </svg>
      ))}
    </div>
  )
}
