import { describe, expect, it } from 'vitest'
import { SPRITES } from './characters.js'
import { parse } from './parser.js'
import { Engine } from '../runtime/engine.js'

describe('ready-made characters', () => {
  it('every sprite is a full 12×12 picture with a color for every letter', () => {
    for (const [name, s] of Object.entries(SPRITES)) {
      expect(s.rows, name).toHaveLength(12)
      for (const row of s.rows) {
        expect(row, `${name}: "${row}"`).toHaveLength(12)
        for (const ch of row) if (ch !== '.') expect(s.colors[ch], `${name} needs a color for "${ch}"`).toBeTruthy()
      }
    }
  })

  it('"hero is a knight" makes a knight', () => {
    const p = parse('hero is a knight at left, size 60')
    expect(p.errors).toEqual([])
    expect(p.program!.looks.hero).toMatchObject({ sprite: 'knight', size: 60, shape: null })
  })

  it('characters can be used by name without describing them first', () => {
    const p = parse('make a slime at right\nslime chases hero 1\nhero is a wizard')
    expect(p.errors).toEqual([])
    expect(p.program!.looks.slime.sprite).toBe('slime')
  })

  it('a character can become another one', () => {
    const p = parse('hero is a knight\nwhen hero is clicked: hero becomes a dragon')
    expect(p.errors).toEqual([])
    const e = new Engine(p.program!, { say() {}, ask() {}, error() {}, stopped() {} } as never)
    e.start()
    const hero = e.things[0]
    expect(hero.sprite).toBe('knight')
  })

  it('names that are not characters still work as before', () => {
    const p = parse('ball is a red circle\nscore is 0')
    expect(p.errors).toEqual([])
    expect(p.program!.looks.ball.sprite).toBeNull()
  })
})
