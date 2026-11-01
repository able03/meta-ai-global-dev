// Minimal client for the Meta Model API (OpenAI-compatible Responses endpoint).

export interface MuseReply {
  text: string
  inputTokens: number
  outputTokens: number
}

export class MuseError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

const BASE_URL = 'https://api.meta.ai/v1'

export async function askMuse(instructions: string, input: string): Promise<MuseReply> {
  const apiKey = process.env.MODEL_API_KEY
  if (!apiKey) throw new MuseError('The server has no MODEL_API_KEY set.', 500)

  const effort = process.env.MUSE_REASONING_EFFORT ?? 'low'
  const body: Record<string, unknown> = {
    model: process.env.MUSE_MODEL || 'muse-spark-1.3',
    instructions,
    input,
  }
  if (effort !== 'none') body.reasoning = { effort }

  const res = await fetch(`${BASE_URL}/responses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new MuseError(`Muse API error ${res.status}: ${detail.slice(0, 300)}`, res.status)
  }
  const data = (await res.json()) as {
    output?: { type: string; content?: { type: string; text?: string }[] }[]
    output_text?: string
    usage?: { input_tokens?: number; output_tokens?: number }
  }
  const text =
    data.output_text ??
    (data.output ?? [])
      .filter((o) => o.type === 'message')
      .flatMap((o) => o.content ?? [])
      .filter((c) => c.type === 'output_text')
      .map((c) => c.text ?? '')
      .join('')
  return {
    text,
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  }
}

/** Pulls the first JSON object out of a reply, even if the model wrapped it in prose or fences. */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('No JSON object in the reply.')
  return JSON.parse(text.slice(start, end + 1))
}
