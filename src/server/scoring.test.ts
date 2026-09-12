import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildLeaderboard, hintCost, perfectTurnScore, scoreCorrect } from '@/server/scoring'
import { DEFAULT_CONFIG } from '@/server/defaults'
import type { Attempt, Difficulty, Player } from '@/lib/types'

const { basePoints, timeouts, hintCostRatio, timeFloor, minScore } = DEFAULT_CONFIG
const base = { basePoints, timeouts, hintCostRatio, timeFloor, minScore }

const score = (difficulty: Difficulty, elapsedMs: number, hintsUsed = 0) =>
  scoreCorrect({ difficulty, elapsedMs, hintsUsed, ...base })

test('an instant answer earns the full base for its difficulty', () => {
  assert.equal(score('easy', 0), 100)
  assert.equal(score('medium', 0), 150)
  assert.equal(score('hard', 0), 200)
})

test('points decay to the 30% floor at the buzzer', () => {
  assert.equal(score('easy', 30_000), 30)
  assert.equal(score('medium', 40_000), 45)
  assert.equal(score('hard', 50_000), 60)
})

test('decay is normalised per difficulty, so tiers stay comparable', () => {
  // Half of each question's own clock spent => same 65% multiplier everywhere.
  assert.equal(score('easy', 15_000), Math.round(100 * 0.65))
  assert.equal(score('medium', 20_000), Math.round(150 * 0.65))
  assert.equal(score('hard', 25_000), Math.round(200 * 0.65))
})

test('a hard question always outscores an easy one answered at the same pace', () => {
  // The point of weighting the base: cracking the hard word must pay more.
  for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
    const easy = score('easy', timeouts.easy * 1000 * fraction)
    const hard = score('hard', timeouts.hard * 1000 * fraction)
    assert.ok(hard > easy, `hard ${hard} should beat easy ${easy} at ${fraction}`)
  }
})

test('hint cost is 20% of the difficulty base', () => {
  assert.equal(hintCost('easy', basePoints, hintCostRatio), 20)
  assert.equal(hintCost('medium', basePoints, hintCostRatio), 30)
  assert.equal(hintCost('hard', basePoints, hintCostRatio), 40)
  assert.equal(score('hard', 0, 2), 200 - 80)
})

test('a correct answer never scores below the floor, however slow and hinted', () => {
  assert.equal(score('easy', 30_000, 6), minScore)
  assert.equal(score('hard', 999_999, 99), minScore)
})

test('overrunning the clock cannot produce a negative time factor', () => {
  assert.equal(score('easy', 120_000), 30)
})

test('a perfect turn is worth 800 at the default profile', () => {
  assert.equal(perfectTurnScore(DEFAULT_CONFIG), 800)
})

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

test('leaderboard ranks on points, then hints, then time', () => {
  const rows = buildLeaderboard([
    player('Ana', [attempt({ points: 100, hintsUsed: 2, elapsedMs: 5_000 })]),
    player('Bogdan', [attempt({ points: 300 })]),
    // Level on points with Ana, but used fewer hints -> ranks above her.
    player('Corina', [attempt({ points: 100, hintsUsed: 0, elapsedMs: 9_000 })]),
  ])

  assert.deepEqual(
    rows.map((r) => r.name),
    ['Bogdan', 'Corina', 'Ana'],
  )
  assert.deepEqual(
    rows.map((r) => r.rank),
    [1, 2, 3],
  )
})

test('time breaks a tie when points and hints are level', () => {
  const rows = buildLeaderboard([
    player('Slow', [attempt({ points: 100, elapsedMs: 20_000 })]),
    player('Fast', [attempt({ points: 100, elapsedMs: 4_000 })]),
  ])
  assert.equal(rows[0].name, 'Fast')
})

test('players level on all three criteria share a rank', () => {
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
