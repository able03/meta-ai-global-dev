// POST /api/translate — { code, words } or { code, steps, instruction } → tidy Steps.

import { checkGate, recordUse } from './_lib/limits.js'
import { MuseError } from './_lib/muse.js'
import { translate, TranslateError } from './_lib/translate.js'

const MAX_CHARS = 4000

export async function POST(request: Request): Promise<Response> {
  let body: { code?: string; words?: string; steps?: string; instruction?: string }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Bad request.' }, 400)
  }
  const tooLong = [body.words, body.steps, body.instruction].some((s) => typeof s === 'string' && s.length > MAX_CHARS)
  if (tooLong) return json({ error: 'That is a lot of words! Try a shorter description.' }, 413)

  const gate = await checkGate(body.code)
  if (!gate.ok) return json({ error: gate.error }, gate.status)

  try {
    const result = await translate(body)
    await recordUse(body.code as string, result.inputTokens, result.outputTokens)
    return json({ steps: result.steps, assumptions: result.assumptions, sentences: result.sentences, remaining: gate.remaining - 1 })
  } catch (e) {
    if (e instanceof TranslateError) {
      const spent = e as TranslateError & { inputTokens?: number; outputTokens?: number }
      if (spent.inputTokens) await recordUse(body.code as string, spent.inputTokens, spent.outputTokens ?? 0)
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
