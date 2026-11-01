import { afterEach, describe, expect, it, vi } from 'vitest'
import { parse } from '../../src/lang/parser.js'
import { SYSTEM_PROMPT } from './prompt.js'
import { translate } from './translate.js'

function museReplies(...texts: string[]) {
  const fetchMock = vi.fn()
  for (const text of texts) {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ output_text: text, usage: { input_tokens: 1000, output_tokens: 200 } }), { status: 200 }),
    )
  }
  vi.stubGlobal('fetch', fetchMock)
  process.env.MODEL_API_KEY = 'test-key'
  return fetchMock
}

afterEach(() => vi.unstubAllGlobals())

describe('prompt', () => {
  it('only teaches Steps that Sayntax can actually read', () => {
    const examples = [...SYSTEM_PROMPT.matchAll(/^\{"steps":(".*?"),"assumptions"/gm)].map((m) => JSON.parse(m[1]) as string)
    expect(examples.length).toBe(3)
    for (const steps of examples) expect(parse(steps).errors).toEqual([])
  })
})

describe('translate', () => {
  it('returns validated steps, assumptions and sentence links', async () => {
    museReplies(
      JSON.stringify({
        steps: 'ball is a red circle at center, size 40\nball moves down-right 5\nball bounces',
        assumptions: ['Speed is 5'],
        sentences: [{ text: 'a red ball', lines: [1] }, { text: 'bouncing', lines: [2, 3, 99] }],
      }),
    )
    const t = await translate({ words: 'a red ball bouncing' })
    expect(t.steps.split('\n')).toHaveLength(3)
    expect(t.assumptions).toEqual(['Speed is 5'])
    expect(t.sentences[1].lines).toEqual([2, 3]) // out-of-range line dropped
  })

  it('retries once when Muse returns Steps that do not parse', async () => {
    const fetchMock = museReplies(
      '{"steps":"ball is a red circle\\nball bouces","assumptions":[],"sentences":[]}',
      '{"steps":"ball is a red circle\\nball bounces","assumptions":[],"sentences":[]}',
    )
    const t = await translate({ words: 'a bouncing ball' })
    expect(t.steps).toContain('ball bounces')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const secondInput = JSON.parse(fetchMock.mock.calls[1][1].body).input as string
    expect(secondInput).toContain('did you mean "bounces"')
  })

  it('gives up kindly after the retry fails too', async () => {
    museReplies('not json at all', 'still not json')
    await expect(translate({ words: 'something' })).rejects.toThrow('try saying it another way')
  })

  it('sends edits as current program + change request', async () => {
    const fetchMock = museReplies('{"steps":"ball is a red circle\\nball moves right 10","assumptions":[],"sentences":[]}')
    await translate({ steps: 'ball is a red circle\nball moves right 5', instruction: 'make it faster' })
    const input = JSON.parse(fetchMock.mock.calls[0][1].body).input as string
    expect(input).toContain('Current program:')
    expect(input).toContain('make it faster')
  })
})
