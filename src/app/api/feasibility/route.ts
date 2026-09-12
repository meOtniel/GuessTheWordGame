import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ensureCategories } from '@/server/bootstrap'
import { checkFeasibility } from '@/server/draw'
import { PACE_ESTIMATE } from '@/server/defaults'
import { DIFFICULTIES, type ByDifficulty } from '@/lib/types'

export const dynamic = 'force-dynamic'

const byDifficulty = z.object({
  easy: z.number().int().min(0).max(30),
  medium: z.number().int().min(0).max(30),
  hard: z.number().int().min(0).max(30),
})

const schema = z.object({
  playerCount: z.number().int().min(1).max(60),
  categoryIds: z.array(z.string()).min(1),
  profile: byDifficulty,
  timeouts: z.object({
    easy: z.number().int().min(5).max(300),
    medium: z.number().int().min(5).max(300),
    hard: z.number().int().min(5).max(300),
  }),
  themedPerPlayer: z.number().int().min(0).max(20),
})

/**
 * Duration estimates for the setup screen. At a reception the clock, not the
 * dataset, is the binding constraint — so the host sees three numbers:
 * the likely run, a pessimistic one, and the hard ceiling if every single
 * question runs to timeout.
 */
function estimateDuration(
  playerCount: number,
  profile: ByDifficulty<number>,
  timeouts: ByDifficulty<number>,
  revealSec: number,
) {
  const questionsPerPlayer = DIFFICULTIES.reduce((s, d) => s + profile[d], 0)
  const overhead = PACE_ESTIMATE.perPlayerOverheadSec + questionsPerPlayer * revealSec

  const sum = (seconds: (d: (typeof DIFFICULTIES)[number]) => number) =>
    DIFFICULTIES.reduce((s, d) => s + profile[d] * seconds(d), 0)

  const realistic = sum((d) => Math.min(PACE_ESTIMATE.realistic[d], timeouts[d])) + overhead
  const pessimistic = sum((d) => timeouts[d] * PACE_ESTIMATE.pessimisticFraction) + overhead
  const worst = sum((d) => timeouts[d]) + overhead

  return {
    questionsPerPlayer,
    perPlayerSec: { realistic, pessimistic, worst },
    totalSec: {
      realistic: Math.round(realistic * playerCount),
      pessimistic: Math.round(pessimistic * playerCount),
      worst: Math.round(worst * playerCount),
    },
  }
}

export async function POST(request: Request) {
  const body = schema.safeParse(await request.json())
  if (!body.success) {
    return NextResponse.json({ ok: false, errors: ['Configurație invalidă.'], warnings: [] }, { status: 400 })
  }

  const { playerCount, categoryIds, profile, timeouts, themedPerPlayer } = body.data
  const all = await ensureCategories()
  const selected = all.filter((c) => categoryIds.includes(c.id))

  const feasibility = checkFeasibility(playerCount, profile, themedPerPlayer, selected)
  const questionsUsed = playerCount * DIFFICULTIES.reduce((s, d) => s + profile[d], 0)
  const questionsAvailable = selected.reduce((s, c) => s + c.questions.length, 0)

  return NextResponse.json({
    ok: feasibility.ok,
    errors: feasibility.errors,
    warnings: feasibility.warnings,
    questionsUsed,
    questionsAvailable,
    estimate: estimateDuration(playerCount, profile, timeouts, 3),
  })
}
