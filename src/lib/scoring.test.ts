import assert from 'node:assert/strict'
import { test } from 'node:test'
import { answerLetters } from '@/lib/normalize'
import { buildLeaderboard, cleanBonus, liveScore, nextHintCost, perfectTurnScore, scoreCorrect } from '@/lib/scoring'
import { buildSlots } from '@/lib/tiles'
import { DEFAULT_CONFIG } from '@/server/defaults'
import type { Attempt, Difficulty, Player, PublicQuestion } from '@/lib/types'

const { basePoints, timeouts, hintPenaltyShare, cleanBonusRatio, timeFloor, minScore } = DEFAULT_CONFIG
const base = { basePoints, timeouts, hintPenaltyShare, cleanBonusRatio, timeFloor, minScore }

/** Eight letters unless a test needs otherwise — the shortest answer allowed. */
const input = (difficulty: Difficulty, elapsedMs: number, hintsUsed = 0, letterCount = 8) => ({
  difficulty,
  elapsedMs,
  hintsUsed,
  letterCount,
  ...base,
})

const score = (difficulty: Difficulty, elapsedMs: number, hintsUsed = 0, letterCount = 8) =>
  scoreCorrect(input(difficulty, elapsedMs, hintsUsed, letterCount))

// --- the clock --------------------------------------------------------------

test('an instant unaided answer earns the base plus the clean-solve bonus', () => {
  assert.equal(score('easy', 0), 110)
  assert.equal(score('medium', 0), 165)
  assert.equal(score('hard', 0), 220)
})

test('points decay to the 30% floor at the buzzer', () => {
  assert.equal(score('easy', 30_000), 30 + 10)
  assert.equal(score('medium', 40_000), 45 + 15)
  assert.equal(score('hard', 50_000), 60 + 20)
})

test('decay is normalised per difficulty, so tiers stay comparable', () => {
  // Half of each question's own clock spent => same 65% multiplier everywhere.
  assert.equal(score('easy', 15_000), Math.round(100 * 0.65) + 10)
  assert.equal(score('medium', 20_000), Math.round(150 * 0.65) + 15)
  assert.equal(score('hard', 25_000), Math.round(200 * 0.65) + 20)
})

test('a hard question always outscores an easy one answered at the same pace', () => {
  for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
    const easy = score('easy', timeouts.easy * 1000 * fraction)
    const hard = score('hard', timeouts.hard * 1000 * fraction)
    assert.ok(hard > easy, `hard ${hard} should beat easy ${easy} at ${fraction}`)
  }
})

test('the clock is quantised to whole seconds, so the figure on screen is the one awarded', () => {
  // Anywhere inside the same second the answer is worth exactly the same, so a
  // player never loses a point to the moderator reaching for the button.
  assert.equal(score('easy', 10_000), score('easy', 10_999))
  assert.notEqual(score('easy', 10_999), score('easy', 11_000))
})

test('overrunning the clock cannot produce a negative time factor', () => {
  assert.equal(score('easy', 120_000), 40)
})

// --- helper letters ---------------------------------------------------------

test('a helper letter costs its share of the word, not a flat fee', () => {
  // An eighth of an eight-letter answer, a sixteenth of a sixteen-letter one:
  // the price tracks the help, which a flat cost got exactly backwards.
  assert.equal(score('easy', 0, 1, 8), Math.round(100 * (7 / 8)))
  assert.equal(score('easy', 0, 1, 16), Math.round(100 * (15 / 16)))
  assert.ok(score('easy', 0, 1, 16) > score('easy', 0, 1, 8))
})

test('every helper letter costs something — there is no free letter', () => {
  // The old subtractive penalty bottomed out at the floor, after which revealing
  // the rest of the word cost nothing at all. Each letter must still bite.
  for (const letters of [8, 12, 16]) {
    let previous = score('easy', 28_000, 0, letters)
    for (let hints = 1; hints < letters; hints++) {
      const next = score('easy', 28_000, hints, letters)
      assert.ok(next < previous, `letter ${hints} of ${letters} was free: ${previous} -> ${next}`)
      previous = next
    }
    assert.ok(previous >= 1, 'a correct answer is always worth at least a point')
  }
})

test('the clean-solve bonus is forfeited by the first helper letter and never returns', () => {
  assert.equal(cleanBonus(input('hard', 0, 0)), 20)
  assert.equal(cleanBonus(input('hard', 0, 1)), 0)
  assert.equal(cleanBonus(input('hard', 0, 5)), 0)
})

test('the quoted hint cost is exactly what the player loses', () => {
  for (const hints of [0, 1, 3]) {
    const now = input('medium', 12_000, hints, 10)
    assert.equal(scoreCorrect({ ...now, hintsUsed: hints + 1 }), scoreCorrect(now) - nextHintCost(now))
  }
})

test('the first helper letter costs the most, because it also spends the bonus', () => {
  const at = (hints: number) => nextHintCost(input('medium', 12_000, hints, 10))
  assert.ok(at(0) > at(1), `first letter ${at(0)} should cost more than the second ${at(1)}`)
})

test('a hinted answer never beats the same answer given unaided', () => {
  for (const elapsed of [0, 9_000, 21_000, 30_000]) {
    for (let hints = 1; hints < 8; hints++) {
      assert.ok(score('easy', elapsed, hints) < score('easy', elapsed, 0))
    }
  }
})

test('the score floor applies to the clock, not to the helper letters', () => {
  // At the default bases the decayed value never falls under minScore, so force
  // the case: a 20-point question decays to 6 at the buzzer, which the floor
  // lifts back to 10. The letters then cut into that guarantee rather than
  // stopping dead at it the way a subtractive penalty did.
  const tiny = { ...base, basePoints: { easy: 20, medium: 20, hard: 20 }, cleanBonusRatio: 0 }
  const floored = (hintsUsed: number) =>
    scoreCorrect({ difficulty: 'easy' as Difficulty, elapsedMs: 30_000, hintsUsed, letterCount: 8, ...tiny })

  assert.equal(floored(0), minScore)
  assert.equal(floored(4), Math.round(minScore * (4 / 8)))
  assert.equal(floored(7), 1)
})

test('a perfect turn is worth 880 at the default profile', () => {
  assert.equal(perfectTurnScore(DEFAULT_CONFIG), 880)
})

test('the letter count matches the tile pool the player actually sees', () => {
  // Gaps between words are not tiles, so a two-word answer is priced on letters.
  assert.equal(answerLetters('NUNTĂ DE AUR').length, 10)
})

// --- leaderboard ------------------------------------------------------------

const attempt = (over: Partial<Attempt> = {}): Attempt => ({
  questionId: 'q',
  categoryId: 'c',
  difficulty: 'easy',
  correct: true,
  points: 0,
  hintsUsed: 0,
  wrongAttempts: 0,
  elapsedMs: 0,
  ...over,
})

const player = (name: string, attempts: Attempt[], adjustment = 0): Player => ({
  id: name,
  name,
  questions: [],
  attempts,
  status: 'done',
  adjustment,
})

test('leaderboard ranks on points first', () => {
  const rows = buildLeaderboard([
    player('Ana', [attempt({ points: 100 })]),
    player('Bogdan', [attempt({ points: 300 })]),
  ])
  assert.deepEqual(
    rows.map((r) => r.name),
    ['Bogdan', 'Ana'],
  )
})

test('level on points, the player who solved more words ranks higher', () => {
  const rows = buildLeaderboard([
    player('Doi', [attempt({ points: 100 }), attempt({ points: 0, correct: false })]),
    player('Trei', [attempt({ points: 40 }), attempt({ points: 60 })]),
  ])
  assert.deepEqual(
    rows.map((r) => r.name),
    ['Trei', 'Doi'],
  )
})

test('helper letters are not a tiebreaker — they are already paid for in points', () => {
  const rows = buildLeaderboard([
    player('Ajutat', [attempt({ points: 100, hintsUsed: 3, elapsedMs: 4_000 })]),
    player('Singur', [attempt({ points: 100, hintsUsed: 0, elapsedMs: 9_000 })]),
  ])
  assert.deepEqual(
    rows.map((r) => r.name),
    ['Ajutat', 'Singur'],
  )
})

test('time, then wrong guesses, break a tie', () => {
  const rows = buildLeaderboard([
    player('Lent', [attempt({ points: 100, elapsedMs: 20_000 })]),
    player('Rapid', [attempt({ points: 100, elapsedMs: 4_000, wrongAttempts: 2 })]),
    player('Sigur', [attempt({ points: 100, elapsedMs: 4_000, wrongAttempts: 0 })]),
  ])
  assert.deepEqual(
    rows.map((r) => r.name),
    ['Sigur', 'Rapid', 'Lent'],
  )
})

test('players level on every criterion share a rank', () => {
  const rows = buildLeaderboard([
    player('A', [attempt({ points: 100, elapsedMs: 5_000 })]),
    player('B', [attempt({ points: 100, elapsedMs: 5_000 })]),
    player('C', [attempt({ points: 50, elapsedMs: 5_000 })]),
  ])
  assert.deepEqual(
    rows.map((r) => r.rank),
    [1, 1, 3],
  )
})

test('host adjustments count toward the total', () => {
  const rows = buildLeaderboard([player('Ana', [attempt({ points: 100 })], 50)])
  assert.equal(rows[0].points, 150)
})

// --- the figures on screen --------------------------------------------------

/** A minimal live question: only the fields liveScore actually reads. */
const publicQuestion = (difficulty: Difficulty, letterCount: number, hintsUsed: number): PublicQuestion =>
  ({
    difficulty,
    timeoutSec: DEFAULT_CONFIG.timeouts[difficulty],
    hintsUsed,
    slots: buildSlots('A'.repeat(letterCount)),
  }) as PublicQuestion

test('the screen recomputes the same figures the server would award', () => {
  // The two must agree exactly, or the tablet quotes a price the server does
  // not honour — which is precisely what a stale push used to do.
  for (const [difficulty, letters] of [['easy', 8], ['medium', 10], ['hard', 12]] as const) {
    const totalMs = DEFAULT_CONFIG.timeouts[difficulty] * 1000
    for (let elapsed = 0; elapsed <= totalMs; elapsed += 250) {
      for (const hints of [0, 1, 4]) {
        const onScreen = liveScore(publicQuestion(difficulty, letters, hints), DEFAULT_CONFIG, totalMs - elapsed)
        const server = input(difficulty, elapsed, hints, letters)
        assert.equal(onScreen.points, scoreCorrect(server), `points at ${elapsed}ms, ${hints} hints`)
        assert.equal(onScreen.hintCost, nextHintCost(server), `hint cost at ${elapsed}ms, ${hints} hints`)
        assert.equal(onScreen.cleanBonus, cleanBonus(server), `bonus at ${elapsed}ms, ${hints} hints`)
      }
    }
  }
})

test('the quoted hint cost survives the delay between reading it and tapping it', () => {
  // The regression: the price was read off a push up to a heartbeat old, so the
  // score fell by the letter *plus* five seconds of unshown decay. Ticking the
  // clock locally keeps the gap to the render tick, which quantisation absorbs.
  const totalMs = DEFAULT_CONFIG.timeouts.medium * 1000
  for (let elapsed = 0; elapsed <= totalMs - 1000; elapsed += 100) {
    const shown = liveScore(publicQuestion('medium', 10, 0), DEFAULT_CONFIG, totalMs - elapsed)
    // Worst case the tap lands one render tick later, still inside the second.
    const afterTap = scoreCorrect(input('medium', elapsed + 99, 1, 10))
    assert.equal(shown.points - afterTap, shown.hintCost, `at ${elapsed}ms`)
  }
})

test('a clock past the buzzer still prices the question, it does not go negative', () => {
  const late = liveScore(publicQuestion('easy', 8, 0), DEFAULT_CONFIG, -5_000)
  assert.equal(late.points, scoreCorrect(input('easy', DEFAULT_CONFIG.timeouts.easy * 1000, 0, 8)))
  assert.ok(late.hintCost >= 0)
})
