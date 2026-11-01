// Stickers with every kind of Sayntax line. Tap one to write it into your game.

interface Word {
  snippet: string
  tip: string
}

const GROUPS: { name: string; words: Word[] }[] = [
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

export function WordBank({ onPick }: { onPick(snippet: string): void }) {
  return (
    <section className="word-bank" aria-labelledby="word-bank-title">
      <h2 id="word-bank-title">Word bank</h2>
      <p className="word-bank-help">Tap a sticker to write it into your game.</p>
      <div className="word-groups">
        {GROUPS.map((g) => (
          <div key={g.name} className="word-group">
            <h3>{g.name}</h3>
            <div className="stickers">
              {g.words.map((w) => (
                <button key={w.snippet} className="sticker" onClick={() => onPick(w.snippet)} title={w.tip}>
                  <span className="sticker-code">{w.snippet.split('\n')[0]}</span>
                  <span className="sticker-tip">{w.tip}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
