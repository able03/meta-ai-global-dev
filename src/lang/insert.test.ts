import { describe, expect, it } from 'vitest'
import { insertSnippet } from './insert.js'
import { parse } from './parser.js'

describe('insertSnippet', () => {
  it('fills an empty notebook', () => {
    expect(insertSnippet('', 'cat is a 🐱 at center', 0)).toEqual({ source: 'cat is a 🐱 at center', lines: [1] })
  })

  it('drops between lines and reports the new line numbers', () => {
    const r = insertSnippet('ball is a red circle\nball bounces', 'ball moves right 5', 1)
    expect(r.source).toBe('ball is a red circle\nball moves right 5\nball bounces')
    expect(r.lines).toEqual([2])
  })

  it('indents into a block when dropped under a line ending in ":"', () => {
    const src = 'basket is a 🧺\nscore is 0\nwhen basket touches ⭐:\n    add 1 to score'
    const r = insertSnippet(src, 'play coin sound', 3)
    expect(r.source.split('\n')[3]).toBe('    play coin sound')
    expect(parse(r.source).errors).toEqual([])
  })

  it('stays inside a block when dropped among indented lines', () => {
    const r = insertSnippet('forever:\n    say "a"\n    say "b"', 'wait 1 second', 2)
    expect(r.source).toBe('forever:\n    say "a"\n    wait 1 second\n    say "b"')
  })

  it('always puts "when" events at the far left', () => {
    const r = insertSnippet('forever:\n    say "a"', 'when cat is clicked: say "Meow!"', 2)
    expect(r.source.split('\n')[2]).toBe('when cat is clicked: say "Meow!"')
  })

  it('indents every line of a multi-line sticker', () => {
    const r = insertSnippet('forever:\n    say "a"', 'if score is 10:\n    say "You win!"', 2)
    expect(r.source).toBe('forever:\n    say "a"\n    if score is 10:\n        say "You win!"')
    expect(r.lines).toEqual([3, 4])
  })
})
