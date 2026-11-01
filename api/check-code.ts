// POST /api/check-code — { code } → whether the access code unlocks the AI, and how many uses are left today.

import { checkGate } from './_lib/limits.js'

export async function POST(request: Request): Promise<Response> {
  const { code } = (await request.json().catch(() => ({}))) as { code?: string }
  const gate = await checkGate(code)
  const body = gate.ok ? { ok: true, remaining: gate.remaining } : { ok: false, error: gate.error }
  return new Response(JSON.stringify(body), {
    status: gate.ok ? 200 : gate.status,
    headers: { 'Content-Type': 'application/json' },
  })
}
