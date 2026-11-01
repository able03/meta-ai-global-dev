import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from './parser.js'

const example = (name: string) => readFileSync(new URL(`../../examples/${name}`, import.meta.url), 'utf8')

function ok(source: string) {
  const result = parse(source)
  expect(result.errors).toEqual([])
  return result.program!
}

function errorFor(source: string) {
  const result = parse(source)
  expect(result.program).toBeNull()
  return result.errors[0]
}

describe('examples', () => {
  const dir = new URL('../../examples/', import.meta.url)
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.say'))) {
    it(`parses ${file}`, () => {
      ok(example(file))
    })
  }
})

describe('things', () => {
  it('reads a thing with color, shape, place and size', () => {
    const p = ok('ball is a red circle at center, size 30')
    expect(p.body[0]).toMatchObject({ k: 'thing', name: 'ball', color: 'red', shape: 'circle', size: 30 })
    expect(p.looks.ball).toMatchObject({ color: 'red', shape: 'circle' })
  })

  it('reads emoji things and places like "random x, top"', () => {
    const p = ok('make a ⭐ at random x, top')
    expect(p.body[0]).toMatchObject({ k: 'make', name: '⭐', at: { x: { kind: 'random' }, y: { kind: 'min' } } })
    expect(p.looks['⭐'].emoji).toBe('⭐')
  })

  it('lets common words like "star" be made without describing them', () => {
    const p = ok('make a star')
    expect(p.looks.star.emoji).toBe('⭐')
  })
})

describe('forgiveness', () => {
  it('ignores case, "the" and trailing periods', () => {
    const p = ok('The Ball is a Blue Square.\nMove the ball LEFT 10.')
    expect(p.body[1]).toMatchObject({ k: 'move', dir: 'left', ref: { name: 'ball' } })
  })

  it('fixes plurals', () => {
    const p = ok('basket is a 🧺\nstar is a ⭐\nwhen basket touches stars:\n    remove that star')
    expect(p.body[2]).toMatchObject({ k: 'whenTouch', b: { name: 'star' } })
  })

  it('accepts synonyms and arrows', () => {
    const p = ok('ball is a ball\nwhen left arrow is pressed → move ball left 5\nwhen ball collides with edge: ball bounces')
    expect(p.body[1]).toMatchObject({ k: 'whenKey', key: 'left' })
    expect(p.body[2]).toMatchObject({ k: 'whenEdge', side: 'any' })
  })

  it('accepts unquoted say text', () => {
    const p = ok('say hello there')
    expect(p.body[0]).toMatchObject({ k: 'say', expr: { k: 'str', value: 'hello there' } })
  })

  it('combines "down and right"', () => {
    const p = ok('ball is a circle\nball moves down and right 4')
    expect(p.body[1]).toMatchObject({ k: 'moves', dir: 'down-right' })
  })

  it('accepts tabs or any number of spaces for indentation', () => {
    ok('x is 0\nrepeat 3 times:\n\tadd 1 to x\n\tsay x')
    ok('x is 0\nrepeat 3 times:\n  add 1 to x\n  say x')
  })
})

describe('control flow', () => {
  it('builds if / otherwise if / otherwise chains', () => {
    const p = ok(example('guess-the-number.say'))
    const loop = p.body.find((s) => s.k === 'forever')!
    if (loop.k !== 'forever') throw new Error()
    const ifStmt = loop.body[1]
    expect(ifStmt.k).toBe('if')
    if (ifStmt.k !== 'if') throw new Error()
    expect(ifStmt.otherwise?.[0].k).toBe('if')
  })

  it('reads comparisons in plain words', () => {
    const p = ok('score is 3\nif score is more than 2:\n    say "big"')
    expect(p.body[1]).toMatchObject({ k: 'if', cond: { k: 'cmp', op: '>' } })
  })

  it('reads inline blocks', () => {
    const p = ok('basket is a 🧺\nwhen space key is pressed: move basket up 20')
    expect(p.body[1]).toMatchObject({ k: 'whenKey', key: 'space', body: [{ k: 'move' }] })
  })
})

describe('friendly errors', () => {
  it('suggests the right word for a typo', () => {
    const e = errorFor('ball is a red circle\nball bouces')
    expect(e.line).toBe(2)
    expect(e.message).toContain('did you mean "bounces"')
  })

  it('suggests a known name for a misspelled character', () => {
    const e = errorFor('ball is a red circle\nmove bal left 10')
    expect(e.message).toContain('did you mean "ball"')
  })

  it('explains an unknown variable', () => {
    const e = errorFor('say points')
    expect(e.message).toContain('Give it a value first')
  })

  it('asks for a colon on block lines', () => {
    const e = errorFor('forever say "hi"')
    expect(e.message).toContain(':')
  })

  it('rejects empty blocks', () => {
    const e = errorFor('forever:\nsay "hi"')
    expect(e.message).toContain('empty')
  })

  it('keeps "when" at the left edge', () => {
    const e = errorFor('ball is a circle\nforever:\n    when ball hits edge: ball bounces')
    expect(e.message).toContain('left')
  })
})
