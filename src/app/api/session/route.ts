import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ensureCategories } from '@/server/bootstrap'
import { createSession, getWarnings, publicState, resetSession, syncClock } from '@/server/session-store'

export const dynamic = 'force-dynamic'

const schema = z.object({
  playerNames: z.array(z.string().trim().min(1).max(40)).min(1).max(60),
  categoryIds: z.array(z.string()).min(1),
  profile: z.object({
    easy: z.number().int().min(0).max(30),
    medium: z.number().int().min(0).max(30),
    hard: z.number().int().min(0).max(30),
  }),
  timeouts: z.object({
    easy: z.number().int().min(5).max(300),
    medium: z.number().int().min(5).max(300),
    hard: z.number().int().min(5).max(300),
  }),
  themedPerPlayer: z.number().int().min(0).max(20),
  targetEndAt: z.number().nullable(),
})

export async function GET(request: Request) {
  await ensureCategories()
  syncClock()
  // Only the moderator console asks for host mode; the tablet and the guest
  // display never do, so the answer stays off those screens.
  const host = new URL(request.url).searchParams.get('host') === '1'
  return NextResponse.json({ state: publicState({ host }), warnings: getWarnings() })
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Configurație invalidă.', issues: parsed.error.issues }, { status: 400 })
  }

  const input = parsed.data
  const names = input.playerNames.map((n) => n.trim())
  if (new Set(names).size !== names.length) {
    return NextResponse.json({ error: 'Numele jucătorilor trebuie să fie diferite.' }, { status: 400 })
  }

  const categories = await ensureCategories()
  try {
    const state = createSession({ ...input, playerNames: names }, categories)
    return NextResponse.json({ state, warnings: getWarnings() })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}

export async function DELETE() {
  await ensureCategories()
  return NextResponse.json({ state: resetSession(), warnings: [] })
}
