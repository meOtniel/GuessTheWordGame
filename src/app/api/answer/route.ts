import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ensureCategories } from '@/server/bootstrap'
import { submitAnswer } from '@/server/session-store'

export const dynamic = 'force-dynamic'

/**
 * The client sends which tile sits in which slot — never a word. The server
 * maps tile ids back to letters and does the comparison itself, so the answer
 * never has to reach the browser before the reveal.
 */
const schema = z.object({
  placement: z.record(z.string(), z.string()),
})

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Răspuns invalid.' }, { status: 400 })

  await ensureCategories()
  const placement: Record<number, string> = {}
  for (const [slot, tileId] of Object.entries(parsed.data.placement)) {
    const index = Number(slot)
    if (Number.isInteger(index)) placement[index] = tileId
  }

  const { correct, state } = submitAnswer(placement)
  return NextResponse.json({ correct, state })
}
