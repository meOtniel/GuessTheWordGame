import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ensureCategories } from '@/server/bootstrap'
import { judgeAnswer } from '@/server/session-store'

export const dynamic = 'force-dynamic'

/**
 * Moderator verdict on a spoken answer. Separate from /api/answer, which is
 * the player's own tile submission — this one trusts the host, not the tiles.
 */
const schema = z.object({ correct: z.boolean() })

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Verdict invalid.' }, { status: 400 })

  await ensureCategories()
  return NextResponse.json({ state: judgeAnswer(parsed.data.correct) })
}
