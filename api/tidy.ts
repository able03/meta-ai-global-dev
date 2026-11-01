// POST /api/tidy — { code?, source } → the program with its messy lines tidied into Sayntax.
// Cached answers are free for everyone (no access code needed); only new text reaches Muse.

import { cacheKey, changedLines, messyLines } from '../src/lang/tidy.js'
import { checkGate, recordUse } from './_lib/limits.js'
import { MuseError } from './_lib/muse.js'
import { PHRASEBOOK } from './_lib/phrasebook.js'
import { getJson, setJson } from './_lib/store.js'
import { TidyError, tidyWithMuse } from './_lib/tidy.js'

const MAX_CHARS = 6000
const CACHE_DAYS = 60

interface Cached {
  steps: string
  assumptions: string[]
}

export async function POST(request: Request): Promise<Response> {
  let body: { code?: string; source?: string }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Bad request.' }, 400)
  }
  const source = typeof body.source === 'string' ? body.source.replace(/\r\n/g, '\n') : ''
  if (!source.trim()) return json({ error: 'Write or say something first!' }, 400)
  if (source.length > MAX_CHARS) return json({ error: 'That is a lot of words! Try a shorter program.' }, 413)
  if (!messyLines(source).length) return json({ steps: source, assumptions: [], changed: [], cached: true })

  const key = await cacheKey(source)
  const hit = PHRASEBOOK[key] ?? (await getJson<Cached>(`sayntax:tidy:${key}`).catch(() => null))
  if (hit) return json({ ...hit, changed: changedLines(source, hit.steps), cached: true })

  const gate = await checkGate(body.code)
  if (!gate.ok) return json({ error: gate.error, needsCode: gate.status === 401 }, gate.status)

  try {
    const result = await tidyWithMuse(source)
    await recordUse(body.code as string, result.inputTokens, result.outputTokens)
    const value: Cached = { steps: result.steps, assumptions: result.assumptions }
    await setJson(`sayntax:tidy:${key}`, value, CACHE_DAYS * 24 * 3600).catch(() => {})
    return json({ ...value, changed: changedLines(source, result.steps), cached: false, remaining: gate.remaining - 1 })
  } catch (e) {
    if (e instanceof TidyError) {
      if (e.inputTokens) await recordUse(body.code as string, e.inputTokens, e.outputTokens)
      return json({ error: e.message }, 422)
    }
    if (e instanceof MuseError) {
      console.error(e.message)
      return json({ error: 'The AI is having trouble right now. Try again in a moment.' }, 502)
    }
    console.error(e)
    return json({ error: 'Something went wrong on the server.' }, 500)
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}
