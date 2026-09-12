import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ensureCategories } from '@/server/bootstrap'
import { requestHint } from '@/server/session-store'

export const dynamic = 'force-dynamic'

// The caller's current board. Optional: an older client, or the moderator with
// nothing mirrored yet, simply gets a hint chosen against an empty board.
const Body = z.object({ placement: z.record(z.string()).optional() })

export async function POST(request: Request) {
  await ensureCategories()
  const parsed = Body.safeParse(await request.json().catch(() => ({})))
  return NextResponse.json({ state: requestHint(parsed.success ? (parsed.data.placement ?? {}) : {}) })
}
