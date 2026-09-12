import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ensureCategories } from '@/server/bootstrap'
import { setLivePlacement } from '@/server/session-store'

export const dynamic = 'force-dynamic'

/**
 * The player's board as it stands right now, so the projector and the
 * moderator can watch the word come together instead of waiting for the
 * finished guess.
 *
 * Like /api/answer this carries tile ids, never letters — the server already
 * knows which tile bears which character, and the screens that receive the
 * mirror were already sent the scrambled pool. Nothing here is scored: a
 * client that stays silent is simply not mirrored.
 */
const schema = z.object({
  placement: z.record(z.string(), z.string()),
})

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Poziționare invalidă.' }, { status: 400 })

  await ensureCategories()
  const placement: Record<number, string> = {}
  for (const [slot, tileId] of Object.entries(parsed.data.placement)) {
    const index = Number(slot)
    if (Number.isInteger(index)) placement[index] = tileId
  }

  setLivePlacement(placement)
  // No state comes back: the tablet owns its own board and must never be told
  // what it is holding, or a slow round-trip would fight the player's taps.
  return NextResponse.json({ ok: true })
}
