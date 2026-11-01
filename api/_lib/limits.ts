// Access codes, per-code daily limits and a hard global spend cap.
// Uses Upstash Redis (REST) when configured so limits hold across serverless instances;
// otherwise falls back to memory, which is only good enough for local development.

const memory = new Map<string, number>()

async function redis(commands: (string | number)[][]): Promise<unknown[] | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(commands.map((c) => c.map(String))),
  })
  if (!res.ok) throw new Error(`Limit store error ${res.status}`)
  const data = (await res.json()) as { result: unknown }[]
  return data.map((d) => d.result)
}

async function getNumber(key: string): Promise<number> {
  const r = await redis([['GET', key]])
  if (r) return Number(r[0] ?? 0)
  return memory.get(key) ?? 0
}

async function addNumber(key: string, by: number, ttlSeconds?: number): Promise<number> {
  const cmds: (string | number)[][] = [['INCRBYFLOAT', key, by]]
  if (ttlSeconds) cmds.push(['EXPIRE', key, ttlSeconds])
  const r = await redis(cmds)
  if (r) return Number(r[0])
  const next = (memory.get(key) ?? 0) + by
  memory.set(key, next)
  return next
}

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

export type Gate =
  | { ok: true; remaining: number }
  | { ok: false; status: number; error: string }

/** Checks a code before an AI call. Does not count the call yet. */
export async function checkGate(code: string | undefined): Promise<Gate> {
  const limit = code ? accessCodes().get(code) : undefined
  if (!code || limit === undefined) return { ok: false, status: 401, error: 'That access code is not valid.' }
  const cap = Number(process.env.SPEND_CAP_USD ?? 100)
  if ((await getNumber(SPEND_KEY)) >= cap) {
    return { ok: false, status: 503, error: 'The AI is resting — the demo has reached its budget. You can still type Steps directly!' }
  }
  const used = await getNumber(usesKey(code))
  if (used >= limit) {
    return { ok: false, status: 429, error: `This code has used all ${limit} AI translations for today. You can still type Steps directly!` }
  }
  return { ok: true, remaining: limit - used }
}

/** Records one AI translation and its cost. */
export async function recordUse(code: string, inputTokens: number, outputTokens: number): Promise<void> {
  const inPrice = Number(process.env.PRICE_INPUT_PER_M ?? 1.25)
  const outPrice = Number(process.env.PRICE_OUTPUT_PER_M ?? 4.25)
  const cost = (inputTokens * inPrice + outputTokens * outPrice) / 1_000_000
  await Promise.all([addNumber(usesKey(code), 1, 60 * 60 * 26), addNumber(SPEND_KEY, cost)])
}
