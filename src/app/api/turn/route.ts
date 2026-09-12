import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ensureCategories } from '@/server/bootstrap'
import { advance, startTurn } from '@/server/session-store'

export const dynamic = 'force-dynamic'

const schema = z.object({ action: z.enum(['start', 'advance']) })

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Acțiune necunoscută.' }, { status: 400 })

  await ensureCategories()
  const state = parsed.data.action === 'start' ? startTurn() : advance()
  return NextResponse.json({ state })
}
