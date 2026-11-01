// Words → Steps with Muse, checked by the real Sayntax parser and repaired once if needed.

import { parse } from '../../src/lang/parser.js'
import { askMuse, extractJson } from './muse.js'
import { createInput, editInput, repairInput, SYSTEM_PROMPT } from './prompt.js'

export interface Translation {
  steps: string
  assumptions: string[]
  sentences: { text: string; lines: number[] }[]
  inputTokens: number
  outputTokens: number
}

export class TranslateError extends Error {}

interface Raw {
  steps?: unknown
  assumptions?: unknown
  sentences?: unknown
}

export async function translate(req: { words?: string; steps?: string; instruction?: string }): Promise<Translation> {
  const input =
    req.steps && req.instruction ? editInput(req.steps, req.instruction) : req.words ? createInput(req.words) : null
  if (!input) throw new TranslateError('Say what you want to make first.')

  let tokensIn = 0
  let tokensOut = 0
  let prompt = input
  for (let attempt = 0; attempt < 2; attempt++) {
    const reply = await askMuse(SYSTEM_PROMPT, prompt)
    tokensIn += reply.inputTokens
    tokensOut += reply.outputTokens
    let raw: Raw
    try {
      raw = extractJson(reply.text) as Raw
    } catch {
      prompt = repairInput(input, reply.text.slice(0, 2000), ['The reply was not a JSON object.'])
      continue
    }
    const steps = typeof raw.steps === 'string' ? raw.steps.replace(/\r\n/g, '\n').trim() : ''
    const { errors } = parse(steps)
    if (steps && !errors.length) {
      return {
        steps,
        assumptions: cleanAssumptions(raw.assumptions),
        sentences: cleanSentences(raw.sentences, steps.split('\n').length),
        inputTokens: tokensIn,
        outputTokens: tokensOut,
      }
    }
    prompt = repairInput(input, steps, errors.length ? errors.map((e) => `Line ${e.line}: ${e.message}`) : ['"steps" was empty.'])
  }
  const err = new TranslateError("I didn't quite get that — try saying it another way.")
  Object.assign(err, { inputTokens: tokensIn, outputTokens: tokensOut })
  throw err
}

function cleanAssumptions(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((a): a is string => typeof a === 'string').slice(0, 8) : []
}

function cleanSentences(v: unknown, lineCount: number): Translation['sentences'] {
  if (!Array.isArray(v)) return []
  return v
    .filter((s): s is { text: string; lines: unknown } => !!s && typeof s.text === 'string')
    .map((s) => ({
      text: s.text,
      lines: Array.isArray(s.lines)
        ? s.lines.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= lineCount)
        : [],
    }))
}
