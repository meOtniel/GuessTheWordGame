import { letterSlots } from './tiles'
import type {
  Attempt,
  ByDifficulty,
  Difficulty,
  LeaderboardRow,
  Player,
  PublicQuestion,
  SessionConfig,
} from '@/lib/types'

export interface ScoreInput {
  difficulty: Difficulty
  elapsedMs: number
  hintsUsed: number
  /** Letters in the answer — the denominator the hint penalty is measured in. */
  letterCount: number
  basePoints: ByDifficulty<number>
  timeouts: ByDifficulty<number>
  hintPenaltyShare: number
  cleanBonusRatio: number
  timeFloor: number
  minScore: number
}

/**
 * What the clock alone leaves of the base, before any helper letter is counted.
 *
 * The multiplier is normalised against each question's own timeout, so the three
 * tiers stay directly comparable even though a hard question runs on a 50s clock
 * and an easy one on 30s — half your clock is worth the same fraction either way.
 *
 * Elapsed time is quantised to whole seconds on purpose. The number on the
 * tablet is then the number the player is actually awarded: within one tick of
 * the countdown it does not move, so nobody loses points in the gap between
 * saying the word and the moderator's thumb landing on the button.
 */
function timedValue(input: ScoreInput): number {
  const { difficulty, elapsedMs, basePoints, timeouts, timeFloor, minScore } = input
  const totalMs = timeouts[difficulty] * 1000
  if (totalMs <= 0) return 0

  const spent = Math.min(totalMs, Math.max(0, Math.floor(elapsedMs / 1000) * 1000))
  const remaining = totalMs - spent
  // Algebraically `base * (floor + (1 - floor) * remaining / total)`, but kept
  // as a single trailing division: chaining the fractions instead accumulates
  // binary-float error (0.3 + 0.7 * 0.5 is 0.6499999999999999), which flipped
  // exact half-points down and made the tiers score inconsistently.
  const weighted = timeFloor * totalMs + (1 - timeFloor) * remaining
  return Math.max(minScore, Math.round((basePoints[difficulty] * weighted) / totalMs))
}

/**
 * The share of the timed value a player keeps after spending helper letters.
 *
 * Each letter costs a slice of what the answer is worth *right now*, sized to
 * the help it actually gives: one letter of an eight-letter word is an eighth of
 * the answer, one letter of a sixteen-letter word is a sixteenth, and the price
 * follows. A flat per-letter cost got this backwards — it charged the long hard
 * words roughly twice as much per unit of help as the short easy ones.
 *
 * Multiplicative rather than subtractive so the penalty can never bottom out.
 * Subtracting a fixed cost from a decayed score hits the floor after four or
 * five letters, and from there every further letter is free: the optimal play
 * late in the clock becomes "reveal everything", which is both exploitable and
 * visibly so to a room watching the board fill in. Here the tenth letter still
 * costs, because there is always a proportion left to take.
 */
function keptAfterHints(timed: number, input: ScoreInput): number {
  const { hintsUsed, letterCount, hintPenaltyShare } = input
  if (hintsUsed <= 0 || letterCount <= 0) return timed

  // Integer arithmetic throughout: at the default share of 1 this is exactly
  // `timed * (letters - hints) / letters`, with no fraction to drift.
  const forfeited = Math.min(letterCount, hintPenaltyShare * hintsUsed)
  return Math.max(1, Math.round((timed * (letterCount - forfeited)) / letterCount))
}

/**
 * The reward for solving a word with no help at all, on top of the timed value.
 *
 * It does not decay: this is an award for needing nobody, not for being quick,
 * and the clock is already priced separately. It also puts real weight behind
 * the *first* helper letter, which would otherwise be the cheapest of the lot.
 */
export function cleanBonus(input: ScoreInput): number {
  if (input.hintsUsed > 0) return 0
  return Math.round(input.basePoints[input.difficulty] * input.cleanBonusRatio)
}

/**
 * Points for a CORRECT answer: the clock decides what the word is worth, helper
 * letters take a proportional cut of that, and an unaided solve is topped up.
 *
 * `minScore` floors the time decay, not the final figure — so a correct answer
 * given at the buzzer is still worth something, while helper letters keep biting
 * all the way down instead of stopping at a threshold.
 */
export function scoreCorrect(input: ScoreInput): number {
  return keptAfterHints(timedValue(input), input) + cleanBonus(input)
}

/**
 * What the next helper letter would actually cost, at this instant.
 *
 * Derived by scoring the board twice rather than from a formula, so the figure
 * on the button is the difference the player will really see — including the
 * clean-solve bonus that the first letter forfeits.
 */
export function nextHintCost(input: ScoreInput): number {
  return Math.max(0, scoreCorrect(input) - scoreCorrect({ ...input, hintsUsed: input.hintsUsed + 1 }))
}

/** The most one question of this difficulty can be worth: instant and unaided. */
export function questionMax(config: SessionConfig, difficulty: Difficulty): number {
  return config.basePoints[difficulty] + Math.round(config.basePoints[difficulty] * config.cleanBonusRatio)
}

/** The most a single turn can earn: every question instant and unaided. */
export function perfectTurnScore(config: SessionConfig): number {
  return (Object.keys(config.profile) as Difficulty[]).reduce(
    (sum, d) => sum + config.profile[d] * questionMax(config, d),
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
    wrongAttempts: attempts.reduce((s, a) => s + a.wrongAttempts, 0),
  }
}

/**
 * Ranking: points, then words solved, then faster overall, then fewer wrong
 * guesses. Players genuinely level on all four share a rank.
 *
 * Helper letters are deliberately NOT a tiebreaker. They are already paid for in
 * the points, and charging for them twice would rank a guest below someone they
 * finished level with on the strength of a cost they had already settled.
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
      b.points - a.points ||
      b.correctCount - a.correctCount ||
      a.totalTimeMs - b.totalTimeMs ||
      a.wrongAttempts - b.wrongAttempts ||
      a.name.localeCompare(b.name, 'ro'),
  )

  rows.forEach((row, i) => {
    const prev = rows[i - 1]
    const tied =
      prev &&
      prev.points === row.points &&
      prev.correctCount === row.correctCount &&
      prev.totalTimeMs === row.totalTimeMs &&
      prev.wrongAttempts === row.wrongAttempts
    row.rank = tied ? prev.rank : i + 1
  })

  return rows
}

/**
 * The same three figures the tablet and the console put on screen, derived from
 * a clock the caller supplies rather than from the server's last push.
 *
 * The server only speaks when something happens — a tap, a hint, a heartbeat
 * five seconds apart — but the question is losing value continuously in
 * between. Reading `livePoints` and `hintCost` straight off the last push
 * therefore quoted a price up to five seconds old: the button offered a helper
 * letter at −21p and the score fell by 30, because the drop the player saw was
 * the letter *plus* the decay the frozen readout had never shown. Recomputing
 * from the interpolated countdown — the one already driving the ring — keeps
 * every number on screen moving with the clock the player is watching, so the
 * quoted cost is the cost.
 *
 * Pure, and the inputs (`config`, slots, hints used) are all already public, so
 * this runs client-side without the answer ever coming near a browser.
 */
export function liveScore(
  question: PublicQuestion,
  config: SessionConfig,
  remainingMs: number,
): { points: number; hintCost: number; cleanBonus: number } {
  const totalMs = question.timeoutSec * 1000
  const input: ScoreInput = {
    difficulty: question.difficulty,
    // The server sends `remainingMs` off the same unrounded clock it scores
    // with, so turning it back into elapsed reproduces the server's own figure
    // to within the render tick — and the whole-second quantisation in
    // `timedValue` absorbs that.
    elapsedMs: Math.min(totalMs, Math.max(0, totalMs - remainingMs)),
    hintsUsed: question.hintsUsed,
    // One letter slot per letter of the answer: the same denominator the
    // server priced the letter against.
    letterCount: letterSlots(question.slots).length,
    basePoints: config.basePoints,
    timeouts: config.timeouts,
    hintPenaltyShare: config.hintPenaltyShare,
    cleanBonusRatio: config.cleanBonusRatio,
    timeFloor: config.timeFloor,
    minScore: config.minScore,
  }
  return { points: scoreCorrect(input), hintCost: nextHintCost(input), cleanBonus: cleanBonus(input) }
}
