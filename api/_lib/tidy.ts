// Messy lines → Sayntax with Muse, checked by the real parser and repaired once if needed.

import { parse } from '../../src/lang/parser.js'
import { messyLines } from '../../src/lang/tidy.js'
import { askMuse, extractJson } from './muse.js'
import { markMessy, repairInput, SYSTEM_PROMPT } from './prompt.js'

export interface TidyResult {
  steps: string
  assumptions: string[]
  inputTokens: number
  outputTokens: number
}

export class TidyError extends Error {
  inputTokens = 0
  outputTokens = 0
}

export async function tidyWithMuse(source: string): Promise<TidyResult> {
  const input = `Program:\n${markMessy(source, messyLines(source))}`
  let tokensIn = 0
  let tokensOut = 0
  let prompt = input
  for (let attempt = 0; attempt < 2; attempt++) {
    const reply = await askMuse(SYSTEM_PROMPT, prompt)
    tokensIn += reply.inputTokens
    tokensOut += reply.outputTokens
    let raw: { steps?: unknown; assumptions?: unknown }
    try {
      raw = extractJson(reply.text) as typeof raw
    } catch {
      prompt = repairInput(input, reply.text.slice(0, 2000), ['The reply was not a JSON object.'])
      continue
    }
    const steps = typeof raw.steps === 'string' ? raw.steps.replace(/\r\n/g, '\n').trim() : ''
    const { errors } = parse(steps)
    if (steps && !errors.length) {
      const assumptions = Array.isArray(raw.assumptions)
        ? raw.assumptions.filter((a): a is string => typeof a === 'string').slice(0, 8)
        : []
      return { steps, assumptions, inputTokens: tokensIn, outputTokens: tokensOut }
    }
    prompt = repairInput(input, steps, errors.length ? errors.map((e) => `Line ${e.line}: ${e.message}`) : ['"steps" was empty.'])
  }
  const err = new TidyError("I didn't quite get that — try saying it another way.")
  err.inputTokens = tokensIn
  err.outputTokens = tokensOut
  throw err
}
