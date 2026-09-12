/** Shared domain types. Imported by both server modules and client components. */

export type Difficulty = 'easy' | 'medium' | 'hard'
export type Theme = 'christian' | 'general'

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'] as const

/** A record keyed by difficulty — used for counts, timeouts and base points alike. */
export type ByDifficulty<T> = Record<Difficulty, T>

export interface Question {
  id: string
  categoryId: string
  difficulty: Difficulty
  prompt: string
  /** Stored with diacritics; compared and tiled on the normalised form. */
  answer: string
}

export interface Category {
  id: string
  name: string
  theme: Theme
  icon: string
  questions: Question[]
}

export interface SessionConfig {
  playerNames: string[]
  /** How many questions of each difficulty every player receives. */
  profile: ByDifficulty<number>
  /** Seconds allowed per question, by difficulty. */
  timeouts: ByDifficulty<number>
  /** Points a perfect (instant, hint-free) answer is worth, by difficulty. */
  basePoints: ByDifficulty<number>
  /** Fraction of base deducted per helper letter. */
  hintCostRatio: number
  /** Floor of the time-decay multiplier — a buzzer-beater still earns this share. */
  timeFloor: number
  /** A correct answer never scores below this, however slow or hinted. */
  minScore: number
  categoryIds: string[]
  themedPerPlayer: number
  /** How long the reveal screen lingers before auto-advancing. */
  revealMs: number
  /** Optional wall-clock target the pace panel measures against (epoch ms). */
  targetEndAt: number | null
}

export interface Attempt {
  questionId: string
  categoryId: string
  difficulty: Difficulty
  correct: boolean
  points: number
  hintsUsed: number
  wrongAttempts: number
  elapsedMs: number
}

export type PlayerStatus = 'pending' | 'playing' | 'done'

export interface Player {
  id: string
  name: string
  /** Pre-drawn at session creation, ordered easy -> medium -> hard. */
  questions: Question[]
  attempts: Attempt[]
  status: PlayerStatus
  /** Manual host correction, added on top of earned points. */
  adjustment: number
}

export type Phase = 'idle' | 'lobby' | 'question' | 'reveal' | 'turnSummary' | 'finished'

export interface Tile {
  id: string
  char: string
}

export type Slot =
  | { kind: 'letter'; index: number }
  | { kind: 'gap'; index: number }

export interface RevealInfo {
  correct: boolean
  points: number
  /** The answer as authored, with diacritics. */
  answer: string
  hintsUsed: number
  elapsedMs: number
}

export interface Session {
  id: string
  createdAt: number
  config: SessionConfig
  players: Player[]
  currentPlayerIndex: number
  currentQuestionIndex: number
  phase: Phase
  /** Epoch ms when the current question's clock started. */
  questionStartedAt: number | null
  /** Epoch ms when the host paused, or null when running. */
  pausedAt: number | null
  /** Total paused time already accumulated on the current question. */
  pausedMs: number
  tiles: Tile[]
  slots: Slot[]
  /** slot index -> tile id, for letters locked in by helper letters. */
  revealedSlots: Record<number, string>
  wrongAttempts: number
  lastReveal: RevealInfo | null
  finishedAt: number | null
  /** Stamped on every save, so a restart can tell how long it was down. */
  savedAt?: number
}

export interface LeaderboardRow {
  playerId: string
  name: string
  points: number
  hintsUsed: number
  totalTimeMs: number
  correctCount: number
  questionCount: number
  rank: number
}

export interface FinishedSession {
  id: string
  finishedAt: number
  rows: LeaderboardRow[]
}

// ---------------------------------------------------------------------------
// Public view of the session.
//
// This is the ONLY shape that reaches a browser. It deliberately omits the
// current answer and every future question: the play screen receives shuffled
// tiles and sends back tile ids, so a curious guest with DevTools open still
// cannot read the word off the page.
// ---------------------------------------------------------------------------

export interface PublicQuestion {
  number: number
  total: number
  prompt: string
  difficulty: Difficulty
  categoryName: string
  categoryIcon: string
  timeoutSec: number
  basePoints: number
  hintCost: number
  tiles: Tile[]
  slots: Slot[]
  revealedSlots: Record<number, string>
  /**
   * What the player has tapped in so far, mirrored live to the projector and
   * the moderator console. Tile ids only, exactly like `revealedSlots`, so the
   * answer still never reaches a screen that shouldn't have it. The tablet
   * itself ignores this and stays authoritative over its own board.
   */
  livePlacement: Record<number, string>
  hintsUsed: number
  maxHints: number
  remainingMs: number
  livePoints: number
  wrongAttempts: number
}

export interface PublicPlayer {
  id: string
  name: string
  status: PlayerStatus
  points: number
  questionCount: number
  answeredCount: number
}

export interface TurnSummaryRow {
  prompt: string
  answer: string
  categoryName: string
  difficulty: Difficulty
  correct: boolean
  points: number
  hintsUsed: number
}

export interface TurnSummary {
  playerName: string
  points: number
  maxPoints: number
  rows: TurnSummaryRow[]
}

export interface PaceInfo {
  elapsedMs: number
  playersDone: number
  playersTotal: number
  avgPerPlayerMs: number | null
  projectedEndAt: number | null
  targetEndAt: number | null
  behindSchedule: boolean
}

export interface PublicState {
  phase: Phase
  serverNow: number
  paused: boolean
  config: SessionConfig | null
  players: PublicPlayer[]
  currentPlayer: PublicPlayer | null
  question: PublicQuestion | null
  reveal: RevealInfo | null
  turnSummary: TurnSummary | null
  leaderboard: LeaderboardRow[]
  lastSession: FinishedSession | null
  pace: PaceInfo | null
  /**
   * The current answer — present ONLY for the moderator console, which asks
   * for it explicitly (`?host=1`). The player tablet and the guest display
   * never request it, so the word still never reaches those screens.
   */
  hostAnswer?: string | null
}
