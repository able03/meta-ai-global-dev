// Tiny key-value store: Upstash Redis (REST) when configured, so data is shared across
// serverless instances; otherwise process memory, which is only good enough for local dev.

const memory = new Map<string, string>()

async function redis(commands: (string | number)[][]): Promise<unknown[] | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(commands.map((c) => c.map(String))),
  })
  if (!res.ok) throw new Error(`Store error ${res.status}`)
  const data = (await res.json()) as { result: unknown }[]
  return data.map((d) => d.result)
}

export async function getNumber(key: string): Promise<number> {
  const r = await redis([['GET', key]])
  if (r) return Number(r[0] ?? 0)
  return Number(memory.get(key) ?? 0)
}

export async function addNumber(key: string, by: number, ttlSeconds?: number): Promise<number> {
  const cmds: (string | number)[][] = [['INCRBYFLOAT', key, by]]
  if (ttlSeconds) cmds.push(['EXPIRE', key, ttlSeconds])
  const r = await redis(cmds)
  if (r) return Number(r[0])
  const next = Number(memory.get(key) ?? 0) + by
  memory.set(key, String(next))
  return next
}

export async function getJson<T>(key: string): Promise<T | null> {
  const r = await redis([['GET', key]])
  const raw = r ? (r[0] as string | null) : (memory.get(key) ?? null)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export async function setJson(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  const raw = JSON.stringify(value)
  const r = await redis(ttlSeconds ? [['SET', key, raw, 'EX', ttlSeconds]] : [['SET', key, raw]])
  if (!r) memory.set(key, raw)
}
