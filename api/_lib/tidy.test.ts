import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parse } from '../../src/lang/parser.js'
import { POST } from '../tidy.js'
import { EXAMPLES, MARK } from './prompt.js'
import { tidyWithMuse } from './tidy.js'

function museReplies(...texts: string[]) {
  const fetchMock = vi.fn()
  for (const text of texts) {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ output_text: text, usage: { input_tokens: 1000, output_tokens: 200 } }), { status: 200 }),
    )
  }
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const call = (body: unknown) =>
  POST(new Request('http://localhost/api/tidy', { method: 'POST', body: JSON.stringify(body) })).then(async (r) => ({
    status: r.status,
    data: await r.json(),
  }))

beforeEach(() => {
  process.env.MODEL_API_KEY = 'test-key'
  process.env.ACCESS_CODES = 'TEST:5'
  delete process.env.UPSTASH_REDIS_REST_URL
})
afterEach(() => vi.unstubAllGlobals())

describe('prompt examples', () => {
  it('only teach Steps that Sayntax can read', () => {
    for (const ex of EXAMPLES) expect(parse(ex.steps).errors).toEqual([])
  })

  it('mark only the lines Sayntax cannot read', () => {
    for (const ex of EXAMPLES) {
      const unmarked = ex.input.split('\n').filter((l) => !l.startsWith(MARK)).join('\n')
      if (unmarked) expect(parse(unmarked).errors).toEqual([])
    }
  })
})

describe('tidyWithMuse', () => {
  it('retries once with the parser errors when Muse returns broken Steps', async () => {
    const fetchMock = museReplies(
      '{"steps":"ball is a red circle\\nball bouncez around","assumptions":[]}',
      '{"steps":"ball is a red circle\\nball bounces","assumptions":["It is red"]}',
    )
    const r = await tidyWithMuse('ball is a red circle\nit bounces everywhere')
    expect(r.steps).toBe('ball is a red circle\nball bounces')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const firstInput = JSON.parse(fetchMock.mock.calls[0][1].body).input as string
    expect(firstInput).toContain(`${MARK}it bounces everywhere`)
    expect(firstInput).toContain('ball is a red circle\n')
  })

  it('gives up kindly when the retry fails too', async () => {
    museReplies('not json', 'still not json')
    await expect(tidyWithMuse('do a cool thing')).rejects.toThrow('try saying it another way')
  })
})

describe('POST /api/tidy', () => {
  it('needs no AI when nothing is messy', async () => {
    const fetchMock = museReplies()
    const r = await call({ source: 'ball is a red circle' })
    expect(r.data.cached).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('asks for a code when the AI is needed', async () => {
    museReplies()
    const r = await call({ source: 'a frog that hops when i press space and nobody has asked this before' })
    expect(r.status).toBe(401)
    expect(r.data.needsCode).toBe(true)
  })

  it('caches answers so the same words never use the AI twice — even without a code', async () => {
    const fetchMock = museReplies('{"steps":"🐸 is a 🐸 at center\\nwhen space key is pressed: move 🐸 up 40","assumptions":["Hops 40"]}')
    const words = 'A green frog that hops when I press space'
    const first = await call({ code: 'TEST', source: words })
    expect(first.status).toBe(200)
    expect(first.data.cached).toBe(false)
    expect(first.data.changed).toEqual([1, 2])

    const again = await call({ source: 'a green frog that hops when i press space.' })
    expect(again.status).toBe(200)
    expect(again.data.cached).toBe(true)
    expect(again.data.steps).toBe(first.data.steps)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
