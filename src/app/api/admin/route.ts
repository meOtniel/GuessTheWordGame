import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ensureCategories } from '@/server/bootstrap'
import {
  adjustScore,
  endSession,
  pause,
  replayTurn,
  resume,
  skipQuestion,
  updateTimeouts,
} from '@/server/session-store'

export const dynamic = 'force-dynamic'

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('pause') }),
  z.object({ action: z.literal('resume') }),
  z.object({ action: z.literal('skip') }),
  z.object({ action: z.literal('end') }),
  z.object({ action: z.literal('replay'), playerId: z.string() }),
  z.object({ action: z.literal('adjust'), playerId: z.string(), delta: z.number().int().min(-9999).max(9999) }),
  z.object({
    action: z.literal('timeouts'),
    timeouts: z.object({
      easy: z.number().int().min(5).max(300),
      medium: z.number().int().min(5).max(300),
      hard: z.number().int().min(5).max(300),
    }),
  }),
])

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Acțiune necunoscută.' }, { status: 400 })

  await ensureCategories()
  const command = parsed.data

  switch (command.action) {
    case 'pause':
      return NextResponse.json({ state: pause() })
    case 'resume':
      return NextResponse.json({ state: resume() })
    case 'skip':
      return NextResponse.json({ state: skipQuestion() })
    case 'end':
      return NextResponse.json({ state: endSession() })
    case 'replay':
      return NextResponse.json({ state: replayTurn(command.playerId) })
    case 'adjust':
      return NextResponse.json({ state: adjustScore(command.playerId, command.delta) })
    case 'timeouts':
      return NextResponse.json({ state: updateTimeouts(command.timeouts) })
  }
}
