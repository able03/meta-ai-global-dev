import { describe, expect, it } from 'vitest'
import { autocorrect, cacheKey, changedLines, messyLines } from './tidy.js'

describe('messyLines', () => {
  it('finds the lines Sayntax cannot read', () => {
    expect(messyLines('ball is a red circle\nmake it zoom around like crazy\nball bounces')).toEqual([2])
  })
})

describe('autocorrect', () => {
  it('fixes typos with no AI', () => {
    const r = autocorrect('ball is a red circle\nball bouces')
    expect(r.source).toBe('ball is a red circle\nball bounces')
    expect(r.fixes).toEqual([{ line: 2, from: 'bouces', to: 'bounces' }])
  })

  it('fixes misspelled names', () => {
    const r = autocorrect('ball is a red circle\nmove bal left 10')
    expect(r.source.split('\n')[1]).toBe('move ball left 10')
  })

  it('leaves real sentences for the AI', () => {
    const src = 'ball is a red circle\nmake it zoom around like crazy'
    expect(autocorrect(src).source).toBe(src)
  })
})

describe('cacheKey', () => {
  it('ignores case, spacing, trailing punctuation and comments', async () => {
    const a = await cacheKey('A red ball that bounces!')
    const b = await cacheKey('# my game\na red   ball that bounces  ')
    expect(a).toBe(b)
  })

  it('keeps indentation meaningful', async () => {
    expect(await cacheKey('forever:\n    say "hi"')).not.toBe(await cacheKey('forever:\nsay "hi"'))
  })
})

describe('changedLines', () => {
  it('lists lines that are new', () => {
    expect(changedLines('ball is a red circle\nmake it bounce', 'ball is a red circle\nball moves down-right 5\nball bounces')).toEqual([2, 3])
  })
})
