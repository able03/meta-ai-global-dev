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

  // A visitor's own Meta API key: their call, their bill — no access code, limits or spend cap.
  // Used for this request only; never stored or logged.
  const ownKey = request.headers.get('x-model-key')?.trim() || undefined
  if (ownKey && (ownKey.length < 10 || ownKey.length > 300)) return json({ error: "That API key doesn't look right.", badKey: true }, 400)

  const gate = ownKey ? { ok: true as const, remaining: Infinity } : await checkGate(body.code)
  if (!gate.ok) return json({ error: gate.error, needsCode: gate.status === 401 }, gate.status)
  const record = (inTokens: number, outTokens: number) =>
    ownKey ? Promise.resolve() : recordUse(body.code as string, inTokens, outTokens)

  try {
    const result = await tidyWithMuse(source, ownKey)
    await record(result.inputTokens, result.outputTokens)
    const value: Cached = { steps: result.steps, assumptions: result.assumptions }
    await setJson(`sayntax:tidy:${key}`, value, CACHE_DAYS * 24 * 3600).catch(() => {})
    return json({
      ...value,
      changed: changedLines(source, result.steps),
      cached: false,
      remaining: ownKey ? null : gate.remaining - 1,
    })
  } catch (e) {
    if (e instanceof TidyError) {
      if (e.inputTokens) await record(e.inputTokens, e.outputTokens)
      return json({ error: e.message }, 422)
    }
    if (e instanceof MuseError) {
      if (ownKey && (e.status === 401 || e.status === 403)) {
        return json({ error: "Your API key didn't work. Check it in the key settings, or remove it to use an access code.", badKey: true }, 401)
      }
      if (ownKey && e.status === 429) return json({ error: 'Your API key has hit its limit or run out of credit.' }, 429)
      console.error(ownKey ? `Muse error with a visitor key: ${e.status}` : e.message)
      return json({ error: 'The AI is having trouble right now. Try again in a moment.' }, 502)
    }
    console.error(e)
    return json({ error: 'Something went wrong on the server.' }, 500)
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}
