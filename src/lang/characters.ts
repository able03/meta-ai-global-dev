// Ready-made pixel-art characters. Use them by name: `hero is a knight`, `make a slime at right`,
// `hero becomes a dragon`. Each one is a 12×12 picture: one letter per pixel, "." is see-through.
// All original art, drawn for Sayntax.

export interface Sprite {
  /** What the word bank calls it. */
  label: string
  /** True for things you pick up (chest, key, potion) rather than characters. */
  item?: boolean
  rows: string[]
  colors: Record<string, string>
}

export const SPRITES: Record<string, Sprite> = {
  knight: {
    label: 'Knight',
    rows: [
      '....rr......',
      '...rrr......',
      '..ssssss....',
      '.sSssssS....',
      '.svvvvvs....',
      '.sSssssS..w.',
      '..ssssss..w.',
      '.SSssssSS.w.',
      '.S.ssss.Syyy',
      '...ssss...b.',
      '...s..s.....',
      '..bb..bb....',
    ],
    colors: { r: '#e63946', s: '#c3cede', S: '#7d8ba1', v: '#1d1d29', w: '#eef2f7', y: '#ffd23f', b: '#6b4226' },
  },
  wizard: {
    label: 'Wizard',
    rows: [
      '.....pp.....',
      '....ppp.....',
      '...ppypp....',
      '..pppppppp..',
      '....ekek..o.',
      '....kwwk..b.',
      '...wwwwww.b.',
      '..PPwwwwPPb.',
      '..PPPPPPPkb.',
      '..PPPPPPP.b.',
      '..PPPPPPP.b.',
      '...PP..PP.b.',
    ],
    colors: { p: '#5a3d8a', y: '#ffd23f', k: '#f1c27d', e: '#1b1b2f', w: '#f4f4f4', P: '#8e6cc4', b: '#8b5a2b', o: '#4cc9f0' },
  },
  princess: {
    label: 'Princess',
    rows: [
      '...y.y.y....',
      '...yyyyy....',
      '..hhhhhhh...',
      '..hkekekh...',
      '..hkkkkkh...',
      '..hhkkkhh...',
      '....pppp....',
      '...pppppp...',
      '..pPpppppP..',
      '..pppppppp..',
      '.pppppppppp.',
      '.PPPPPPPPPP.',
    ],
    colors: { y: '#ffd23f', h: '#c77d3a', k: '#f5cba7', e: '#1b1b2f', p: '#ff7eb6', P: '#e05297' },
  },
  ninja: {
    label: 'Ninja',
    rows: [
      '....nnnn....',
      '...nnnnnn...',
      '...nkekekn..',
      '...rrrrrrrr.',
      '..nnnnnnn.r.',
      '.nnnnnnnnn..',
      'n.nnNNNnn.n.',
      'n.nnnnnnn.n.',
      '...nnnnn....',
      '...nn.nn....',
      '...nn.nn....',
      '..nnn.nnn...',
    ],
    colors: { n: '#2b2d42', N: '#4a4e69', k: '#f1c27d', e: '#1b1b2f', r: '#e63946' },
  },
  robot: {
    label: 'Robot',
    rows: [
      '.....r......',
      '.....S......',
      '...ssssss...',
      '..sSSSSSSs..',
      '..sScSScSs..',
      '..sSSSSSSs..',
      '...ssyyss...',
      '.ssssssssss.',
      's.ssyssyss.s',
      's.ssssssss.s',
      '..ss....ss..',
      '..SS....SS..',
    ],
    colors: { r: '#e63946', s: '#a9b4c2', S: '#5c677d', c: '#4cc9f0', y: '#ffd23f' },
  },
  slime: {
    label: 'Slime',
    rows: [
      '............',
      '............',
      '............',
      '.....gg.....',
      '....gggg....',
      '...gghggg...',
      '..gghggggg..',
      '.gweggggweg.',
      '.gggggggggg.',
      '.ggggGGgggg.',
      'gggggggggggg',
      '.GGGGGGGGGG.',
    ],
    colors: { g: '#57cc99', G: '#2d9a6a', h: '#c4f5dc', w: '#ffffff', e: '#1b1b2f' },
  },
  dragon: {
    label: 'Dragon',
    rows: [
      '........rr..',
      '.......rrrr.',
      '......rrwerr',
      '..o...rrrrrw',
      '.oo..rrrr...',
      'ooorrrrrr...',
      '.oorryyrr...',
      '..rrryyrr...',
      '.rrrryyrrr..',
      'rr.rrrrrr...',
      'r..rr..rr...',
      '...RR..RR...',
    ],
    colors: { r: '#e63946', R: '#a4161a', y: '#ffb703', w: '#ffffff', e: '#1b1b2f', o: '#f77f00' },
  },
  bat: {
    label: 'Bat',
    rows: [
      '............',
      '............',
      '............',
      'b....BB....b',
      'bb..BBBB..bb',
      'bbbbeBBebbbb',
      '.bbbBBBBbbb.',
      '..b.BBBB.b..',
      '.....BB.....',
      '............',
      '............',
      '............',
    ],
    colors: { b: '#7b2cbf', B: '#3c096c', e: '#ff4d6d' },
  },
  chest: {
    label: 'Chest',
    item: true,
    rows: [
      '............',
      '............',
      '..bbbbbbbb..',
      '.bBBBBBBBBb.',
      '.bbbbbbbbbb.',
      '.BBBByyBBBB.',
      '.bbbbyybbbb.',
      '.bbbbbbbbbb.',
      '.bbbbbbbbbb.',
      '.BBBBBBBBBB.',
      '............',
      '............',
    ],
    colors: { b: '#a0672c', B: '#5e3a1a', y: '#ffd23f' },
  },
  key: {
    label: 'Key',
    item: true,
    rows: [
      '............',
      '............',
      '............',
      '............',
      '..yyy.......',
      '.y...y......',
      '.y...yyyyyyy',
      '.y...y...Y.Y',
      '..yyy....Y.Y',
      '............',
      '............',
      '............',
    ],
    colors: { y: '#ffd23f', Y: '#c99700' },
  },
  potion: {
    label: 'Potion',
    item: true,
    rows: [
      '............',
      '.....cc.....',
      '.....gg.....',
      '.....gg.....',
      '....gggg....',
      '...gwrrrg...',
      '..grrrrrrg..',
      '..grrrrrrg..',
      '..gRrrrrRg..',
      '...gRRRRg...',
      '....gggg....',
      '............',
    ],
    colors: { c: '#8b5a2b', g: '#cfe8ff', w: '#ffffff', r: '#ff4d6d', R: '#c9184a' },
  },
}

export const SPRITE_NAMES = Object.keys(SPRITES)

export const isSprite = (word: string | null | undefined): word is string => !!word && word in SPRITES

// --- Drawing ----------------------------------------------------------------------------
// Each sprite is painted once onto a tiny canvas and reused, so drawing 100 slimes stays cheap.

const cache = new Map<string, HTMLCanvasElement>()

export function spriteCanvas(name: string): HTMLCanvasElement | null {
  const sprite = SPRITES[name]
  if (!sprite || typeof document === 'undefined') return null
  const hit = cache.get(name)
  if (hit) return hit
  const size = sprite.rows.length
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  sprite.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = sprite.colors[row[x]]
      if (!color) continue
      ctx.fillStyle = color
      ctx.fillRect(x, y, 1, 1)
    }
  })
  cache.set(name, canvas)
  return canvas
}

/** A picture of the sprite for the word bank (crisp, scaled up). */
export function spriteDataUrl(name: string, scale = 4): string {
  const small = spriteCanvas(name)
  if (!small) return ''
  const big = document.createElement('canvas')
  big.width = small.width * scale
  big.height = small.height * scale
  const ctx = big.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(small, 0, 0, big.width, big.height)
  return big.toDataURL()
}
