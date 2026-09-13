import type { SessionConfig } from '@/lib/types'

/**
 * The target configuration for the reception: 8 players x 6 questions
 * (3 easy / 2 medium / 1 hard) on a 30/40/50s clock.
 *
 * Question time per player is capped at 3*30 + 2*40 + 1*50 = 220s, which with
 * reveals and handovers puts a hard ceiling of roughly 34 minutes on a full
 * eight-player session — comfortably inside the 40-minute slot even if every
 * single question runs to timeout.
 *
 * On scoring: a question is worth its base the instant it starts and decays
 * linearly to 30% of that at the buzzer. Each helper letter then takes its own
 * share of the word off whatever is left — a letter of an eight-letter answer
 * costs an eighth — and solving with no letters at all pays 10% on top. A
 * perfect turn is 3*110 + 2*165 + 220 = 880.
 *
 * The setup screen edits the players, categories, question profile and clocks;
 * the host panel can retune the clocks again mid-session. The scoring constants
 * below — bases, hint share, clean bonus, floors — are fixed for the evening on
 * purpose, so no mid-game tweak can make one guest's turn score by different
 * rules than the turn before it.
 */
export const DEFAULT_CONFIG: SessionConfig = {
  playerNames: [],
  profile: { easy: 3, medium: 2, hard: 1 },
  timeouts: { easy: 30, medium: 40, hard: 50 },
  basePoints: { easy: 100, medium: 150, hard: 200 },
  hintPenaltyShare: 1,
  cleanBonusRatio: 0.1,
  timeFloor: 0.3,
  minScore: 10,
  categoryIds: [],
  themedPerPlayer: 2,
  revealMs: 3000,
  targetEndAt: null,
}

/** Rough seconds a player spends on a question of each difficulty, used only
 *  for the setup screen's duration estimate. */
export const PACE_ESTIMATE = {
  realistic: { easy: 13, medium: 22, hard: 35 },
  /** Share of each clock consumed in a pessimistic-but-plausible run. */
  pessimisticFraction: 0.8,
  /** Handover + turn summary overhead per player, in seconds. */
  perPlayerOverheadSec: 20,
}

/** Starting difficulty split when the host changes the question count. */
export function suggestProfile(total: number) {
  const hard = Math.max(1, Math.round(total * 0.2))
  const easy = Math.max(1, Math.round(total * 0.4))
  const medium = Math.max(0, total - easy - hard)
  return { easy, medium, hard }
}
