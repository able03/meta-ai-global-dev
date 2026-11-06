// Access codes, per-code daily limits and a hard global spend cap.

import { addNumber, getNumber } from './store.js'

/** ACCESS_CODES="CODE:limit,CODE2:limit" → Map of code → daily limit. */
export function accessCodes(): Map<string, number> {
  const codes = new Map<string, number>()
  for (const pair of (process.env.ACCESS_CODES ?? '').split(',')) {
    const [code, limit] = pair.split(':').map((s) => s.trim())
    if (code) codes.set(code, Number(limit) || 50)
  }
  return codes
}

const today = () => new Date().toISOString().slice(0, 10)
const usesKey = (code: string) => `sayntax:uses:${code}:${today()}`
const SPEND_KEY = 'sayntax:spend-usd'

export type Gate = { ok: true; remaining: number } | { ok: false; status: number; error: string }

/** Checks a code before an AI call. Does not count the call yet. */
export async function checkGate(code: string | undefined): Promise<Gate> {
  const limit = code ? accessCodes().get(code) : undefined
  if (!code || limit === undefined) {
    return { ok: false, status: 401, error: 'This needs the AI — enter an access code to unlock it.' }
  }
  const cap = Number(process.env.SPEND_CAP_USD ?? 100)
  if ((await getNumber(SPEND_KEY)) >= cap) {
    return { ok: false, status: 503, error: 'The AI is resting — the demo has reached its budget. Steps you type yourself still run!' }
  }
  const used = await getNumber(usesKey(code))
  if (used >= limit) {
    return { ok: false, status: 429, error: `This code has used all ${limit} AI tidies for today. Steps you type yourself still run!` }
  }
  return { ok: true, remaining: limit - used }
}

/** Records one AI call and its cost. */
export async function recordUse(code: string, inputTokens: number, outputTokens: number): Promise<void> {
  const inPrice = Number(process.env.PRICE_INPUT_PER_M ?? 1.25)
  const outPrice = Number(process.env.PRICE_OUTPUT_PER_M ?? 4.25)
  const cost = (inputTokens * inPrice + outputTokens * outPrice) / 1_000_000
  await Promise.all([addNumber(usesKey(code), 1, 60 * 60 * 26), addNumber(SPEND_KEY, cost)])
}
