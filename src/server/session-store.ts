import { answerLetters, answersMatch, normalizeRo } from '@/lib/normalize'
import { buildSlots, buildTiles, chooseHint, hintableSlots, letterSlots, maxHints, readPlacement } from '@/lib/tiles'
import type {
  Attempt,
  ByDifficulty,
  Category,
  FinishedSession,
  PaceInfo,
  Player,
  PublicPlayer,
  PublicQuestion,
  PublicState,
  Question,
  Session,
  SessionConfig,
  Theme,
  TurnSummary,
} from '@/lib/types'
import { DEFAULT_CONFIG, PACE_ESTIMATE } from './defaults'
import { drawSession } from './draw'
import { loadLastSessionSync, loadSessionSync, saveLastSession, schedulePersist } from './persistence'
import {
  buildLeaderboard,
  cleanBonus,
  nextHintCost,
  playerPoints,
  questionMax,
  scoreCorrect,
  type ScoreInput,
} from '@/lib/scoring'

export interface CreateSessionInput {
  playerNames: string[]
  categoryIds: string[]
  profile: ByDifficulty<number>
  timeouts: ByDifficulty<number>
  themedPerPlayer: number
  targetEndAt: number | null
}

type Listener = (state: PublicState) => void

interface Subscriber {
  send: Listener
  /** Moderator consoles receive the answer; player and guest screens do not. */
  host: boolean
}

interface Store {
  session: Session | null
  lastSession: FinishedSession | null
  listeners: Set<Subscriber>
  warnings: string[]
  /**
   * The tiles the player has tapped into place but not yet submitted, so the
   * projector and the moderator can watch the word come together.
   *
   * Deliberately NOT part of `Session`: it is a view of a half-finished
   * thought, worth nothing once the turn moves on, and writing it to disk on
   * every letter would churn the session file for no benefit. It is stamped
   * with the turn it belongs to so a stale board can never bleed onto the next
   * question.
   */
  live: { token: string; placement: Record<number, string> }
}

/**
 * Pinned to globalThis so Next's dev-mode hot reload doesn't wipe a session
 * that is mid-game. In production it is simply a module singleton.
 */
const globalRef = globalThis as unknown as { __ghicesteStore?: Store }

/**
 * Come back from a restart PAUSED if a question was in progress.
 *
 * The downtime — a crash, a closed laptop, a restart — is never the guest's
 * fault, and silently burning their clock (or expiring the question outright)
 * would be. The host hands the device back and presses resume.
 */
function rehydrate(session: Session | null): Session | null {
  if (!session) return null
  // A session saved by an older build is missing whatever the config has gained
  // since. Filling the gaps from the defaults keeps a mid-game restart working
  // instead of scoring the rest of the evening against undefined.
  session.config = { ...DEFAULT_CONFIG, ...session.config }
  if (session.phase === 'question') {
    const now = Date.now()
    // Credit back everything between the last save and now — that whole span
    // is downtime the guest never got to play.
    if (session.savedAt) session.pausedMs += Math.max(0, now - session.savedAt)
    if (session.pausedAt === null) session.pausedAt = now
  }
  return session
}

function getStore(): Store {
  if (!globalRef.__ghicesteStore) {
    globalRef.__ghicesteStore = {
      // Rehydrate from disk on first touch: a closed tab, a slept laptop or a
      // crashed process must resume exactly where the game was, because there
      // is no restarting a wedding reception.
      session: rehydrate(loadSessionSync()),
      lastSession: loadLastSessionSync(),
      listeners: new Set(),
      warnings: [],
      live: { token: '', placement: {} },
    }
  }
  return globalRef.__ghicesteStore
}

// --- clock ------------------------------------------------------------------

/** Time spent on the current question, with paused stretches removed. */
function elapsedMs(session: Session, now = Date.now()): number {
  if (session.questionStartedAt === null) return 0
  const pausedNow = session.pausedAt !== null ? now - session.pausedAt : 0
  return Math.max(0, now - session.questionStartedAt - session.pausedMs - pausedNow)
}

function currentQuestion(session: Session): Question | null {
  const player = session.players[session.currentPlayerIndex]
  return player?.questions[session.currentQuestionIndex] ?? null
}

function timeoutSecFor(session: Session, question: Question): number {
  return session.questionTimeoutSec ?? session.config.timeouts[question.difficulty]
}

function timeoutMsFor(session: Session, question: Question): number {
  return timeoutSecFor(session, question) * 1000
}

/**
 * Everything the scorer needs about the question in play, assembled in one
 * place so the live readout, the tapped answer and the moderator's verdict can
 * never drift apart on which rules they used.
 */
function scoreInputFor(session: Session, question: Question, elapsed: number, hintsUsed: number): ScoreInput {
  const { basePoints, timeouts, hintPenaltyShare, cleanBonusRatio, timeFloor, minScore } = session.config
  return {
    difficulty: question.difficulty,
    elapsedMs: elapsed,
    hintsUsed,
    letterCount: answerLetters(question.answer).length,
    basePoints,
    // The question's own pinned clock, not whatever the host has since dialled
    // the tier to — the decay must be measured against the clock the guest is
    // actually racing.
    timeouts: { ...timeouts, [question.difficulty]: timeoutSecFor(session, question) },
    hintPenaltyShare,
    cleanBonusRatio,
    timeFloor,
    minScore,
  }
}

// --- mutation plumbing ------------------------------------------------------

function commit(): PublicState {
  const store = getStore()
  if (store.session) schedulePersist(store.session)

  // Built at most once each, and only if somebody is actually listening.
  let plain: PublicState | null = null
  let host: PublicState | null = null

  for (const subscriber of store.listeners) {
    try {
      if (subscriber.host) {
        host ??= publicState({ host: true })
        subscriber.send(host)
      } else {
        plain ??= publicState()
        subscriber.send(plain)
      }
    } catch {
      // A dead SSE connection must never break a mutation.
    }
  }

  return plain ?? publicState()
}

export function subscribe(listener: Listener, options: { host?: boolean } = {}): () => void {
  const store = getStore()
  const subscriber: Subscriber = { send: listener, host: options.host === true }
  store.listeners.add(subscriber)
  return () => store.listeners.delete(subscriber)
}

// --- live board -------------------------------------------------------------

/**
 * Identifies the exact turn a live board belongs to.
 *
 * `wrongAttempts` is part of it on purpose: a rejected guess invalidates the
 * token, so the projector empties the moment the answer is judged wrong rather
 * than waiting for the tablet to report its own cleared board.
 */
function liveToken(session: Session): string {
  return [
    session.id,
    session.currentPlayerIndex,
    session.currentQuestionIndex,
    session.wrongAttempts,
  ].join(':')
}

/** The live board, but only if it still belongs to the turn being played. */
function liveFor(session: Session): Record<number, string> {
  const { live } = getStore()
  return live.token === liveToken(session) ? live.placement : {}
}

/**
 * Broadcast without persisting. Only the live board changes here, and that is
 * the one piece of state we are content to lose on a restart.
 */
function commitLive(): PublicState {
  const store = getStore()
  let plain: PublicState | null = null
  let host: PublicState | null = null

  for (const subscriber of store.listeners) {
    try {
      if (subscriber.host) {
        host ??= publicState({ host: true })
        subscriber.send(host)
      } else {
        plain ??= publicState()
        subscriber.send(plain)
      }
    } catch {
      // A dead SSE connection must never break a mutation.
    }
  }

  return plain ?? publicState()
}

/**
 * Mirror the tablet's in-progress board to the other screens.
 *
 * Purely cosmetic: scoring still reads the placement that arrives with the
 * submission, so a client that never reports — or reports a lie — changes what
 * the room sees and nothing else.
 */
export function setLivePlacement(placement: Record<number, string>): PublicState {
  const store = getStore()
  const session = store.session
  if (!session || session.phase !== 'question') return publicState()

  store.live = { token: liveToken(session), placement: cleanPlacement(session, placement) }
  return commitLive()
}

/**
 * Keep only tiles that exist and slots that can actually hold a letter, so a
 * malformed report can't paint characters into the gaps between words — or,
 * where a hint reads the board, invent a correct prefix that isn't there.
 */
function cleanPlacement(session: Session, placement: Record<number, string>): Record<number, string> {
  const tileIds = new Set(session.tiles.map((t) => t.id))
  const letterIndexes = new Set(letterSlots(session.slots).map((s) => s.index))
  const clean: Record<number, string> = {}
  for (const [slot, tileId] of Object.entries(placement)) {
    const index = Number(slot)
    if (letterIndexes.has(index) && tileIds.has(tileId)) clean[index] = tileId
  }
  return clean
}

// --- lifecycle --------------------------------------------------------------

export function createSession(input: CreateSessionInput, categories: Category[]): PublicState {
  const store = getStore()
  const seed = `${Date.now()}-${input.playerNames.join('|')}`
  const selected = categories.filter((c) => input.categoryIds.includes(c.id))

  const { questions, warnings } = drawSession(
    input.playerNames.length,
    input.profile,
    input.themedPerPlayer,
    selected,
    seed,
  )

  const config: SessionConfig = {
    ...DEFAULT_CONFIG,
    playerNames: input.playerNames,
    categoryIds: input.categoryIds,
    profile: input.profile,
    timeouts: input.timeouts,
    themedPerPlayer: input.themedPerPlayer,
    targetEndAt: input.targetEndAt,
  }

  const players: Player[] = input.playerNames.map((name, i) => ({
    id: `p${i + 1}`,
    name,
    questions: questions[i],
    attempts: [],
    status: 'pending',
    adjustment: 0,
  }))

  store.warnings = warnings
  store.session = {
    id: seed,
    createdAt: Date.now(),
    config,
    players,
    currentPlayerIndex: 0,
    currentQuestionIndex: 0,
    phase: 'lobby',
    questionStartedAt: null,
    pausedAt: null,
    pausedMs: 0,
    tiles: [],
    slots: [],
    revealedSlots: {},
    wrongAttempts: 0,
    lastReveal: null,
    finishedAt: null,
  }

  return commit()
}

export function resetSession(): PublicState {
  const store = getStore()
  store.session = null
  store.warnings = []
  return commit()
}

// --- turn flow --------------------------------------------------------------

function beginQuestion(session: Session): void {
  const question = currentQuestion(session)
  if (!question) return
  session.tiles = buildTiles(question.answer, `${session.id}:${question.id}`)
  session.slots = buildSlots(question.answer)
  session.revealedSlots = {}
  session.wrongAttempts = 0
  session.questionTimeoutSec = session.config.timeouts[question.difficulty]
  session.questionStartedAt = Date.now()
  session.pausedAt = null
  session.pausedMs = 0
  session.lastReveal = null
  session.phase = 'question'
}

export function startTurn(): PublicState {
  const session = getStore().session
  if (!session || session.phase !== 'lobby') return publicState()
  const player = session.players[session.currentPlayerIndex]
  if (!player) return publicState()

  player.status = 'playing'
  session.currentQuestionIndex = 0
  beginQuestion(session)
  return commit()
}

function recordAttempt(session: Session, correct: boolean, elapsed: number): void {
  const question = currentQuestion(session)
  if (!question) return
  const player = session.players[session.currentPlayerIndex]
  const hintsUsed = Object.keys(session.revealedSlots).length
  const points = correct ? scoreCorrect(scoreInputFor(session, question, elapsed, hintsUsed)) : 0

  const attempt: Attempt = {
    questionId: question.id,
    categoryId: question.categoryId,
    difficulty: question.difficulty,
    correct,
    points,
    hintsUsed,
    wrongAttempts: session.wrongAttempts,
    elapsedMs: elapsed,
  }

  player.attempts.push(attempt)
  session.lastReveal = { correct, points, answer: question.answer, hintsUsed, elapsedMs: elapsed }
  session.phase = 'reveal'
}

export interface SubmitResult {
  correct: boolean
  state: PublicState
}

export function submitAnswer(placement: Record<number, string>): SubmitResult {
  const session = getStore().session
  if (!session || session.phase !== 'question' || session.pausedAt !== null) {
    return { correct: false, state: publicState() }
  }
  const question = currentQuestion(session)
  if (!question) return { correct: false, state: publicState() }

  const elapsed = elapsedMs(session)
  // The clock may have run out between the player's tap and this request.
  if (elapsed >= timeoutMsFor(session, question)) {
    recordAttempt(session, false, timeoutMsFor(session, question))
    return { correct: false, state: commit() }
  }

  const attempt = readPlacement(session.slots, placement, session.tiles)
  if (answersMatch(attempt, question.answer)) {
    recordAttempt(session, true, elapsed)
    return { correct: true, state: commit() }
  }

  session.wrongAttempts += 1
  return { correct: false, state: commit() }
}

/**
 * The moderator awards the question from the console.
 *
 * At a reception the guest usually blurts the word out several seconds before
 * they finish tapping it in, and waiting for the tiles is dead time in front of
 * a watching room. This banks the answer at the moment they *said* it.
 *
 * It scores identically to a tapped answer — same elapsed clock, same hint
 * penalty — so a turn judged by the moderator is directly comparable to one
 * typed out on the tablet.
 */
export function judgeAnswer(correct: boolean): PublicState {
  const session = getStore().session
  if (!session || session.phase !== 'question') return publicState()
  const question = currentQuestion(session)
  if (!question) return publicState()

  const limit = timeoutMsFor(session, question)
  // A paused clock would otherwise award full marks for a frozen timer.
  const elapsed = Math.min(elapsedMs(session), limit)
  recordAttempt(session, correct, correct ? elapsed : limit)
  return commit()
}

/**
 * `placement` is the tablet's own board, sent along with the request rather
 * than read from the live mirror: the mirror is debounced, and a hint tapped
 * straight after a tile lands must not be judged against a board one tap old.
 * The moderator's copy of the button passes the mirror, which is the best it
 * has. Either way the letters the player already has right are spared.
 */
export function requestHint(placement: Record<number, string> = {}): PublicState {
  const session = getStore().session
  if (!session || session.phase !== 'question' || session.pausedAt !== null) return publicState()
  const question = currentQuestion(session)
  if (!question) return publicState()

  const used = Object.keys(session.revealedSlots).length
  if (used >= maxHints(question.answer)) return publicState()

  const hint = chooseHint(
    question.answer,
    session.slots,
    session.revealedSlots,
    cleanPlacement(session, placement),
    session.tiles,
  )
  if (!hint) return publicState()

  session.revealedSlots[hint.slotIndex] = hint.tileId
  return commit()
}

/**
 * Called by the client when its countdown reaches zero, and by syncClock() as
 * a safety net. Re-checks the server's own clock either way, so a client that
 * lies (or lags) cannot end a question early or extend one.
 */
export function expireQuestion(): PublicState {
  const session = getStore().session
  if (!session || session.phase !== 'question') return publicState()
  const question = currentQuestion(session)
  if (!question) return publicState()

  const limit = timeoutMsFor(session, question)
  if (elapsedMs(session) < limit) return publicState()

  recordAttempt(session, false, limit)
  return commit()
}

export function advance(): PublicState {
  const session = getStore().session
  if (!session) return publicState()

  if (session.phase === 'reveal') {
    const player = session.players[session.currentPlayerIndex]
    if (session.currentQuestionIndex < player.questions.length - 1) {
      session.currentQuestionIndex += 1
      beginQuestion(session)
    } else {
      player.status = 'done'
      session.phase = 'turnSummary'
    }
    return commit()
  }

  if (session.phase === 'turnSummary') {
    const nextIndex = session.players.findIndex((p) => p.status === 'pending')
    if (nextIndex === -1) {
      finish(session)
    } else {
      session.currentPlayerIndex = nextIndex
      session.currentQuestionIndex = 0
      session.phase = 'lobby'
      session.questionStartedAt = null
      session.lastReveal = null
    }
    return commit()
  }

  return publicState()
}

function finish(session: Session): void {
  session.phase = 'finished'
  session.finishedAt = Date.now()
  session.questionStartedAt = null
  const finished: FinishedSession = {
    id: session.id,
    finishedAt: session.finishedAt,
    rows: buildLeaderboard(session.players),
  }
  getStore().lastSession = finished
  void saveLastSession(finished)
}

// --- host controls ----------------------------------------------------------

export function pause(): PublicState {
  const session = getStore().session
  if (!session || session.phase !== 'question' || session.pausedAt !== null) return publicState()
  session.pausedAt = Date.now()
  return commit()
}

export function resume(): PublicState {
  const session = getStore().session
  if (!session || session.pausedAt === null) return publicState()
  session.pausedMs += Date.now() - session.pausedAt
  session.pausedAt = null
  return commit()
}

/**
 * Drop a broken question (a typo, an ambiguous clue) from this player's turn.
 *
 * It is replaced rather than simply deleted. The player must not be penalised
 * for the host's dataset, and deleting alone did penalise them: the leaderboard
 * ranks on total points, so a guest left with five questions where everyone else
 * had six was quietly ranked below people they had actually matched. A fresh
 * question of the same difficulty keeps every turn worth the same maximum.
 *
 * Only when the reserve is dry does the question simply disappear, and then the
 * shortened turn shows in the leaderboard's question count.
 */
export function skipQuestion(): PublicState {
  const session = getStore().session
  if (!session || (session.phase !== 'question' && session.phase !== 'reveal')) return publicState()
  const player = session.players[session.currentPlayerIndex]

  const dropped = player.questions[session.currentQuestionIndex]
  const replacement = dropped ? drawReplacement(session, dropped) : null
  if (replacement) player.questions.splice(session.currentQuestionIndex, 1, replacement)
  else player.questions.splice(session.currentQuestionIndex, 1)
  if (session.phase === 'reveal') player.attempts.pop()

  if (session.currentQuestionIndex >= player.questions.length) {
    player.status = 'done'
    session.phase = 'turnSummary'
  } else {
    beginQuestion(session)
  }
  return commit()
}

/** Give a player their turn again from the start, keeping the same questions. */
export function replayTurn(playerId: string): PublicState {
  const session = getStore().session
  if (!session) return publicState()
  const index = session.players.findIndex((p) => p.id === playerId)
  if (index === -1) return publicState()

  const player = session.players[index]
  player.attempts = []
  player.status = 'pending'
  session.currentPlayerIndex = index
  session.currentQuestionIndex = 0
  session.phase = 'lobby'
  session.questionStartedAt = null
  session.lastReveal = null
  session.finishedAt = null
  return commit()
}

export function adjustScore(playerId: string, delta: number): PublicState {
  const session = getStore().session
  if (!session) return publicState()
  const player = session.players.find((p) => p.id === playerId)
  if (!player) return publicState()
  player.adjustment += delta
  return commit()
}

/**
 * Shorten (or lengthen) the remaining questions. The fairest pace lever: the
 * score's time factor is normalised against each question's own timeout, so
 * changing it does not distort the leaderboard.
 */
export function updateTimeouts(timeouts: ByDifficulty<number>): PublicState {
  const session = getStore().session
  if (!session) return publicState()
  session.config.timeouts = timeouts
  // A question already running keeps the clock it started on — see
  // Session.questionTimeoutSec. The next one picks the new value up.
  return commit()
}

export function endSession(): PublicState {
  const session = getStore().session
  if (!session || session.phase === 'finished') return publicState()
  for (const player of session.players) {
    if (player.status !== 'done') player.status = 'done'
  }
  finish(session)
  return commit()
}

// --- projection -------------------------------------------------------------

function toPublicPlayer(player: Player): PublicPlayer {
  return {
    id: player.id,
    name: player.name,
    status: player.status,
    points: playerPoints(player),
    questionCount: player.questions.length,
    answeredCount: player.attempts.length,
  }
}

function buildPublicQuestion(session: Session, now: number): PublicQuestion | null {
  const question = currentQuestion(session)
  if (!question) return null

  const player = session.players[session.currentPlayerIndex]
  const { basePoints } = session.config
  const elapsed = elapsedMs(session, now)
  const limit = timeoutMsFor(session, question)
  const hintsUsed = Object.keys(session.revealedSlots).length
  const scoring = scoreInputFor(session, question, elapsed, hintsUsed)

  return {
    number: session.currentQuestionIndex + 1,
    total: player.questions.length,
    prompt: question.prompt,
    difficulty: question.difficulty,
    categoryName: categoryNameFor(question),
    categoryIcon: categoryIconFor(question),
    timeoutSec: timeoutSecFor(session, question),
    basePoints: basePoints[question.difficulty],
    hintCost: nextHintCost(scoring),
    tiles: session.tiles,
    slots: session.slots,
    revealedSlots: session.revealedSlots,
    livePlacement: liveFor(session),
    hintsUsed,
    maxHints: maxHints(question.answer),
    cleanBonus: cleanBonus(scoring),
    // Read against the live mirror, which is all a button's enabled state
    // needs: the request itself re-checks against the board the tablet sends.
    hintAvailable:
      hintsUsed < maxHints(question.answer) &&
      hintableSlots(question.answer, session.slots, session.revealedSlots, liveFor(session), session.tiles).length > 0,
    remainingMs: Math.max(0, limit - elapsed),
    livePoints: scoreCorrect(scoring),
    wrongAttempts: session.wrongAttempts,
  }
}

// Category data is injected by the API layer (it owns dataset loading), so the
// store stays free of filesystem concerns. The whole dataset is kept, not just
// the display names: replacing a skipped question needs the question pools too.
let categoryLookup: Map<string, Category> = new Map()

export function setCategoryLookup(categories: Category[]): void {
  categoryLookup = new Map(categories.map((c) => [c.id, c]))
}

function categoryNameFor(question: Question): string {
  return categoryLookup.get(question.categoryId)?.name ?? question.categoryId
}

function themeOf(question: Question): Theme | null {
  return categoryLookup.get(question.categoryId)?.theme ?? null
}

/**
 * A stand-in for a question the host has thrown out: same difficulty, same
 * theme class where the reserve allows, never one already dealt anywhere in this
 * session.
 *
 * Preference order among what is left: a category this player has not already
 * seen, then the deepest remaining pool — the same "leave the thin cells in
 * reserve" rule the opening deal runs on, so pulling a replacement mid-session
 * does not starve the players still to come.
 *
 * Returns null when the reserve is genuinely dry.
 */
function drawReplacement(session: Session, dropped: Question): Question | null {
  const dealt = new Set(session.players.flatMap((p) => p.questions.map((q) => q.id)))
  const player = session.players[session.currentPlayerIndex]
  const ownCategories = new Set(player.questions.map((q) => q.categoryId))
  const wantedTheme = themeOf(dropped)

  const pools = session.config.categoryIds
    .map((id) => categoryLookup.get(id))
    .filter((c): c is Category => c !== undefined)
    .map((c) => ({
      category: c,
      pool: c.questions.filter((q) => q.difficulty === dropped.difficulty && !dealt.has(q.id)),
    }))
    .filter((entry) => entry.pool.length > 0)

  if (pools.length === 0) return null

  // Theme first: the two guaranteed themed questions per player are a promise
  // the replacement has to keep. Only if that class is empty do we borrow.
  const themed = wantedTheme === null ? pools : pools.filter((e) => e.category.theme === wantedTheme)
  const eligible = themed.length > 0 ? themed : pools

  const best = eligible
    .map((entry) => ({ ...entry, fresh: ownCategories.has(entry.category.id) ? 1 : 0 }))
    .sort((a, b) => a.fresh - b.fresh || b.pool.length - a.pool.length)[0]

  return best.pool[0]
}

function categoryIconFor(question: Question): string {
  return categoryLookup.get(question.categoryId)?.icon ?? '?'
}

function buildTurnSummary(session: Session): TurnSummary | null {
  const player = session.players[session.currentPlayerIndex]
  if (!player) return null

  const byId = new Map(player.questions.map((q) => [q.id, q]))
  const rows = player.attempts.map((attempt) => {
    const question = byId.get(attempt.questionId)
    return {
      prompt: question?.prompt ?? '',
      answer: question?.answer ?? '',
      categoryName: question ? categoryNameFor(question) : '',
      difficulty: attempt.difficulty,
      correct: attempt.correct,
      points: attempt.points,
      hintsUsed: attempt.hintsUsed,
    }
  })

  const maxPoints = player.questions.reduce((sum, q) => sum + questionMax(session.config, q.difficulty), 0)
  return { playerName: player.name, points: playerPoints(player), maxPoints, rows }
}

function buildPace(session: Session, now: number): PaceInfo {
  const playersDone = session.players.filter((p) => p.status === 'done').length
  const elapsed = now - session.createdAt
  const avg = playersDone > 0 ? elapsed / playersDone : null

  // Before anyone finishes there is nothing measured to project from, so fall
  // back to the configured clocks — a realistic-pace estimate, not a guess.
  const estimatePerPlayer =
    (Object.keys(session.config.profile) as (keyof typeof session.config.profile)[]).reduce(
      (sum, d) => sum + session.config.profile[d] * PACE_ESTIMATE.realistic[d],
      0,
    ) *
      1000 +
    PACE_ESTIMATE.perPlayerOverheadSec * 1000

  const remaining = session.players.length - playersDone
  const perPlayer = avg ?? estimatePerPlayer
  const projectedEndAt = session.phase === 'finished' ? session.finishedAt : now + remaining * perPlayer

  return {
    elapsedMs: elapsed,
    playersDone,
    playersTotal: session.players.length,
    avgPerPlayerMs: avg,
    projectedEndAt,
    targetEndAt: session.config.targetEndAt,
    behindSchedule:
      session.config.targetEndAt !== null && projectedEndAt !== null && projectedEndAt > session.config.targetEndAt,
  }
}

/**
 * Safety net for a question whose clock ran out while nobody was looking —
 * a closed tab, a slept laptop. Any read of the state settles it.
 */
export function syncClock(): void {
  const session = getStore().session
  if (!session || session.phase !== 'question' || session.pausedAt !== null) return
  const question = currentQuestion(session)
  if (!question) return
  if (elapsedMs(session) >= timeoutMsFor(session, question)) expireQuestion()
}

export interface PublicStateOptions {
  /** Moderator console: include the current answer so the host can judge. */
  host?: boolean
}

export function publicState(options: PublicStateOptions = {}): PublicState {
  const store = getStore()
  const session = store.session
  const now = Date.now()

  if (!session) {
    return {
      phase: 'idle',
      serverNow: now,
      paused: false,
      config: null,
      players: [],
      currentPlayer: null,
      question: null,
      reveal: null,
      turnSummary: null,
      leaderboard: [],
      lastSession: store.lastSession,
      pace: null,
    }
  }

  const player = session.players[session.currentPlayerIndex] ?? null

  return {
    phase: session.phase,
    serverNow: now,
    paused: session.pausedAt !== null,
    config: session.config,
    players: session.players.map(toPublicPlayer),
    currentPlayer: player ? toPublicPlayer(player) : null,
    question: session.phase === 'question' ? buildPublicQuestion(session, now) : null,
    reveal: session.phase === 'reveal' ? session.lastReveal : null,
    turnSummary: session.phase === 'turnSummary' ? buildTurnSummary(session) : null,
    leaderboard: buildLeaderboard(session.players),
    lastSession: store.lastSession,
    pace: buildPace(session, now),
    hostAnswer: options.host && session.phase === 'question' ? (currentQuestion(session)?.answer ?? null) : null,
  }
}

export function getWarnings(): string[] {
  return getStore().warnings
}

/** Exposed for the answer-reveal on the display screen only. */
export function currentAnswerNormalized(): string | null {
  const session = getStore().session
  if (!session) return null
  const question = currentQuestion(session)
  return question ? normalizeRo(question.answer) : null
}
