// Free tries for everyone, access codes with daily limits, and a hard global spend cap.

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
const FREE_KEY = 'sayntax:free-uses'
const DEFAULT_FREE_TRIES = 300

/** How many AI tidies all visitors without a code share, in total. */
const freeTries = () => {
  const n = Number(process.env.FREE_TRIES ?? DEFAULT_FREE_TRIES)
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_FREE_TRIES
}

export type Gate = { ok: true; remaining: number } | { ok: false; status: number; error: string }

/** Checks a code before an AI call. Does not count the call yet. */
export async function checkGate(code: string | undefined): Promise<Gate> {
  const limit = code ? accessCodes().get(code) : undefined
  if (code && limit === undefined) {
    return { ok: false, status: 401, error: "That access code didn't work." }
  }
  const cap = Number(process.env.SPEND_CAP_USD ?? 100)
  if ((await getNumber(SPEND_KEY)) >= cap) {
    return { ok: false, status: 503, error: 'The AI is resting — the demo has reached its budget. Steps you type yourself still run!' }
  }
  if (!code) {
    const left = freeTries() - (await getNumber(FREE_KEY))
    if (left <= 0) {
      return { ok: false, status: 401, error: 'All the free AI tries are used up — enter an access code to keep going. Steps you type yourself still run!' }
    }
    return { ok: true, remaining: left }
  }
  const used = await getNumber(usesKey(code))
  if (used >= (limit as number)) {
    return { ok: false, status: 429, error: `This code has used all ${limit} AI tidies for today. Steps you type yourself still run!` }
  }
  return { ok: true, remaining: (limit as number) - used }
}

/** Records one AI call and its cost. */
export async function recordUse(code: string | undefined, inputTokens: number, outputTokens: number): Promise<void> {
  const inPrice = Number(process.env.PRICE_INPUT_PER_M ?? 1.25)
  const outPrice = Number(process.env.PRICE_OUTPUT_PER_M ?? 4.25)
  const cost = (inputTokens * inPrice + outputTokens * outPrice) / 1_000_000
  await Promise.all([code ? addNumber(usesKey(code), 1, 60 * 60 * 26) : addNumber(FREE_KEY, 1), addNumber(SPEND_KEY, cost)])
}
