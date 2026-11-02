// Stickers with every kind of Sayntax line. Tap one to write it into your game, or drag it
// to exactly where it should go in the notebook.

import { useState } from 'react'
import { STICKER_MIME } from './StepsEditor'
import { SPRITES, spriteDataUrl } from '../lang/characters'

interface Word {
  snippet: string
  tip: string
  /** Ready-made pixel character, shown as a picture tile. */
  sprite?: string
}

const HEROES = new Set(['knight', 'wizard', 'princess', 'ninja', 'robot'])

/** One picture sticker per ready-made character. */
const CHARACTER_WORDS: Word[] = Object.entries(SPRITES).map(([name, s]) => ({
  sprite: name,
  snippet: HEROES.has(name) ? `hero is a ${name} at left` : s.item ? `make a ${name} at random place` : `make a ${name} at right`,
  tip: HEROES.has(name)
    ? `Your hero is a ${name}. Rename "hero" to anything you like.`
    : s.item
      ? `A ${name} to pick up somewhere on the map.`
      : `A ${name}! Try "${name} chases hero 1".`,
}))

const GROUPS: { name: string; words: Word[] }[] = [
  { name: 'Characters', words: CHARACTER_WORDS },
  {
    name: 'Make things',
    words: [
      { snippet: 'cat is a 🐱 at center', tip: 'Puts a character on the screen. Try any emoji, or a shape like “a blue square”.' },
      { snippet: 'make a ⭐ at random x, top', tip: 'Makes a new copy. Great for things that keep showing up.' },
      { snippet: 'remove that ⭐', tip: 'Takes it off the screen.' },
    ],
  },
  {
    name: 'Move',
    words: [
      { snippet: 'ball moves right 5', tip: 'Keeps moving that way. Bigger number = faster.' },
      { snippet: '⭐ falls 3', tip: 'Keeps falling down, even new copies.' },
      { snippet: 'ball bounces', tip: 'Bounces off the edges of the screen.' },
      { snippet: 'move cat left 10', tip: 'Moves one time only.' },
    ],
  },
  {
    name: 'Build a world',
    words: [
      { snippet: 'background is green', tip: 'Colors the whole world. Try an emoji too, like 🌳 or ⭐.' },
      { snippet: '🧱 is solid', tip: 'Makes walls nobody can walk through.' },
      { snippet: '👾 chases hero 2', tip: 'Keeps running after the hero. Great for monsters!' },
      { snippet: '🐶 follows hero 3', tip: 'A pet that follows you around.' },
    ],
  },
  {
    name: 'Speak & change',
    words: [
      { snippet: 'hero says "Hello!"', tip: 'A speech bubble over the character.' },
      { snippet: 'show "❤️ {hearts}" at top left', tip: 'Text that stays on the screen, like hearts or a score.' },
      { snippet: 'hero becomes 🐉', tip: 'Turns into something else. Power-up!' },
      { snippet: 'hero grows 20', tip: 'Gets bigger. Use “shrinks” to get smaller.' },
    ],
  },
  {
    name: 'Sounds',
    words: [
      { snippet: 'play coin sound', tip: 'Sounds: coin, jump, hit, win, lose, laser, powerup, boop.' },
      { snippet: 'play win sound', tip: 'A happy tune for when someone wins.' },
    ],
  },
  {
    name: 'When…',
    words: [
      { snippet: 'when left key is pressed: move cat left 10', tip: 'Does something when you press a key.' },
      { snippet: 'when cat touches ⭐:\n    remove that ⭐', tip: 'Does something when two things bump into each other.' },
      { snippet: 'when ball hits edge: say "Boing!"', tip: 'Does something when it reaches the side of the screen.' },
      { snippet: 'when cat is clicked: say "Meow!"', tip: 'Does something when you click it.' },
    ],
  },
  {
    name: 'Count',
    words: [
      { snippet: 'score is 0', tip: 'A variable: a box with a name that holds a number.' },
      { snippet: 'add 1 to score', tip: 'Makes the number in the box bigger.' },
    ],
  },
  {
    name: 'Talk',
    words: [
      { snippet: 'say "Score: {score}"', tip: 'Shows a message. Put a variable in {curly brackets} to show its number.' },
      { snippet: 'ask "What\'s your name?" into name', tip: 'Asks a question and keeps the answer.' },
    ],
  },
  {
    name: 'Repeat & decide',
    words: [
      { snippet: 'every 1 second:\n    make a ⭐ at random x, top', tip: 'Does the lines underneath again and again.' },
      { snippet: 'if score is 10:\n    say "You win!"', tip: 'Only does the lines underneath when this is true.' },
      { snippet: 'wait 1 second', tip: 'Takes a little break.' },
    ],
  },
]

/** One sticker colour per page, so each kind of line has its own look. */
const COLORS = ['#bff0da', '#cfe3ff', '#ffd8b8', '#e3d7ff', '#ffd6e0', '#fff1a8']

const PAGE_KEY = 'sayntax.bank-page'
const loadPage = () => {
  try {
    const n = Number(localStorage.getItem(PAGE_KEY))
    return Number.isInteger(n) && n >= 0 && n < GROUPS.length ? n : 0
  } catch {
    return 0
  }
}

interface Props {
  onPick(snippet: string): void
  onClose?(): void
  /** Dragging a sticker toward the notebook (null when the drag ends). */
  onDragSnippet?(snippet: string | null): void
}

export function WordBank({ onPick, onClose, onDragSnippet }: Props) {
  const [page, setPage] = useState(loadPage)
  const [fresh, setFresh] = useState(true)
  const go = (n: number) => {
    const next = (n + GROUPS.length) % GROUPS.length
    setPage(next)
    setFresh(false)
    try {
      localStorage.setItem(PAGE_KEY, String(next))
    } catch {
      /* remembering the page is only a convenience */
    }
  }
  const g = GROUPS[page]

  return (
    <section className={`word-bank${fresh ? ' fresh' : ''}`} aria-labelledby="word-bank-title">
      <div className="word-bank-head">
        <h2 id="word-bank-title">Word bank</h2>
        {onClose && (
          <button className="tool bank-close" onClick={onClose}>
            Close
          </button>
        )}
      </div>
      <p className="word-bank-help">Tap a sticker, or drag it into your notebook.</p>

      <div className="bank-tabs" role="tablist" aria-label="Kinds of steps">
        {GROUPS.map((grp, i) => (
          <button
            key={grp.name}
            role="tab"
            aria-selected={i === page}
            className={`bank-tab${i === page ? ' on' : ''}`}
            style={{ '--sticker': COLORS[i % COLORS.length] } as React.CSSProperties}
            onClick={() => go(i)}
          >
            {grp.name}
          </button>
        ))}
      </div>

      <div className="word-groups" role="tabpanel" aria-label={g.name}>
        <div key={g.name} className="word-group" style={{ '--sticker': COLORS[page % COLORS.length] } as React.CSSProperties}>
          <div className={g.words[0]?.sprite ? 'stickers picture-stickers' : 'stickers'}>
            {g.words.map((w) => (
              <button
                key={w.snippet}
                className={w.sprite ? 'sticker picture' : 'sticker'}
                onClick={() => onPick(w.snippet)}
                title={w.tip}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(STICKER_MIME, w.snippet)
                  e.dataTransfer.effectAllowed = 'copy'
                  e.currentTarget.classList.add('lifted')
                  onDragSnippet?.(w.snippet)
                }}
                onDragEnd={(e) => {
                  e.currentTarget.classList.remove('lifted')
                  onDragSnippet?.(null)
                }}
              >
                {w.sprite ? (
                  <>
                    <img className="sprite-pic" src={spriteDataUrl(w.sprite)} alt="" draggable={false} />
                    <span className="sprite-name">{SPRITES[w.sprite].label}</span>
                  </>
                ) : (
                  <>
                    <span className="sticker-code">{w.snippet.split('\n')[0]}</span>
                    <span className="sticker-tip">{w.tip}</span>
                  </>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bank-pager">
        <button className="pager-btn" onClick={() => go(page - 1)} aria-label="Previous page">
          ‹
        </button>
        <span className="pager-dots" aria-label={`Page ${page + 1} of ${GROUPS.length}`}>
          {GROUPS.map((grp, i) => (
            <button
              key={grp.name}
              className={`pager-dot${i === page ? ' on' : ''}`}
              onClick={() => go(i)}
              aria-label={grp.name}
              tabIndex={-1}
            />
          ))}
        </span>
        <button className="pager-btn" onClick={() => go(page + 1)} aria-label="Next page">
          ›
        </button>
      </div>
    </section>
  )
}
