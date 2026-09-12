import type { Attempt, ByDifficulty, Difficulty, LeaderboardRow, Player, SessionConfig } from '@/lib/types'

export interface ScoreInput {
  difficulty: Difficulty
  elapsedMs: number
  hintsUsed: number
  basePoints: ByDifficulty<number>
  timeouts: ByDifficulty<number>
  hintCostRatio: number
  timeFloor: number
  minScore: number
}

/** Cost in points of a single helper letter at this difficulty. */
export function hintCost(difficulty: Difficulty, basePoints: ByDifficulty<number>, ratio: number): number {
  return Math.round(basePoints[difficulty] * ratio)
}

/**
 * Points for a CORRECT answer.
 *
 * Base scales with difficulty, and the time multiplier is normalised against
 * each question's own timeout, so the three tiers stay directly comparable even
 * though a hard question runs on a 50s clock and an easy one on 30s.
 */
export function scoreCorrect(input: ScoreInput): number {
  const { difficulty, elapsedMs, hintsUsed, basePoints, timeouts, hintCostRatio, timeFloor, minScore } = input
  const totalMs = timeouts[difficulty] * 1000
  const remaining = Math.max(0, Math.min(totalMs, totalMs - elapsedMs))
  // Algebraically `base * (floor + (1 - floor) * remaining / total)`, but kept
  // as a single trailing division: chaining the fractions instead accumulates
  // binary-float error (0.3 + 0.7 * 0.5 is 0.6499999999999999), which flipped
  // exact half-points down and made the tiers score inconsistently.
  const weighted = timeFloor * totalMs + (1 - timeFloor) * remaining
  const earned = totalMs === 0 ? 0 : Math.round((basePoints[difficulty] * weighted) / totalMs)
  const penalty = hintsUsed * hintCost(difficulty, basePoints, hintCostRatio)
  return Math.max(minScore, earned - penalty)
}

/**
 * What the player would score if they answered right now — drives the live
 * "points remaining" readout, so the cost of stalling is visible.
 */
export function livePoints(input: ScoreInput): number {
  return scoreCorrect(input)
}

/** The most a single turn can earn: every question instant and hint-free. */
export function perfectTurnScore(config: SessionConfig): number {
  return (Object.keys(config.profile) as Difficulty[]).reduce(
    (sum, d) => sum + config.profile[d] * config.basePoints[d],
    0,
  )
}

export function playerPoints(player: Player): number {
  return player.attempts.reduce((sum, a) => sum + a.points, 0) + player.adjustment
}

function summarise(attempts: Attempt[]) {
  return {
    hintsUsed: attempts.reduce((s, a) => s + a.hintsUsed, 0),
    totalTimeMs: attempts.reduce((s, a) => s + a.elapsedMs, 0),
    correctCount: attempts.filter((a) => a.correct).length,
  }
}

/**
 * Ranking: points, then fewer helper letters, then faster overall.
 * Players genuinely level on all three share a rank.
 */
export function buildLeaderboard(players: Player[]): LeaderboardRow[] {
  const rows = players.map((p) => ({
    playerId: p.id,
    name: p.name,
    points: playerPoints(p),
    questionCount: p.questions.length,
    rank: 0,
    ...summarise(p.attempts),
  }))

  rows.sort(
    (a, b) =>
      b.points - a.points || a.hintsUsed - b.hintsUsed || a.totalTimeMs - b.totalTimeMs || a.name.localeCompare(b.name, 'ro'),
  )

  rows.forEach((row, i) => {
    const prev = rows[i - 1]
    const tied =
      prev && prev.points === row.points && prev.hintsUsed === row.hintsUsed && prev.totalTimeMs === row.totalTimeMs
    row.rank = tied ? prev.rank : i + 1
  })

  return rows
}
