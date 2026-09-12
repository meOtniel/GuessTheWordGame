import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkFeasibility, drawSession, planSlots } from '@/server/draw'
import { DEFAULT_CONFIG } from '@/server/defaults'
import { DIFFICULTIES, type ByDifficulty, type Category, type Difficulty, type Theme } from '@/lib/types'

/** Stand-in datasets shaped like the real ones: 9 easy / 9 medium / 6 hard. */
function makeCategory(id: string, theme: Theme, counts: ByDifficulty<number> = { easy: 9, medium: 9, hard: 6 }): Category {
  const questions = DIFFICULTIES.flatMap((d) =>
    Array.from({ length: counts[d] }, (_, i) => ({
      id: `${id}-${d}-${i}`,
      categoryId: id,
      difficulty: d,
      prompt: `Întrebare ${d} ${i} din ${id}`,
      answer: `RASPUNS${i}`,
    })),
  )
  return { id, name: id, theme, icon: '*', questions }
}

const THEMED = ['personaje-biblice', 'locuri-obiecte-biblice', 'virtuti-concepte', 'nunta-casatorie']
const GENERAL = ['geografie', 'istorie', 'industrii-profesii', 'stiinta-natura', 'mancare-gastronomie', 'muzica-arta', 'sport']

const fullPool = (): Category[] => [
  ...THEMED.map((id) => makeCategory(id, 'christian')),
  ...GENERAL.map((id) => makeCategory(id, 'general')),
]

const { profile, themedPerPlayer } = DEFAULT_CONFIG

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const item of items) out[key(item)] = (out[key(item)] ?? 0) + 1
  return out
}

test('planSlots gives every player the identical difficulty profile', () => {
  const plan = planSlots(8, profile, themedPerPlayer)
  assert.equal(plan.length, 8)
  for (const player of plan) {
    const counts = countBy(player, (s) => s.difficulty)
    assert.deepEqual(counts, { easy: 3, medium: 2, hard: 1 })
    assert.equal(player.filter((s) => s.theme === 'christian').length, 2)
  }
})

test('themed slots are not permanently parked on the easy band', () => {
  const plan = planSlots(8, profile, themedPerPlayer)
  const themedDifficulties = new Set(
    plan.flatMap((p) => p.filter((s) => s.theme === 'christian').map((s) => s.difficulty)),
  )
  assert.ok(themedDifficulties.size > 1, 'themed questions should rotate across difficulties')
})

test('the target 8 x 6 deal is exact on both axes', () => {
  const { questions } = drawSession(8, profile, themedPerPlayer, fullPool(), 'wedding')
  const themed = new Set(THEMED)

  assert.equal(questions.length, 8)
  for (const player of questions) {
    assert.equal(player.length, 6)
    assert.deepEqual(countBy(player, (q) => q.difficulty), { easy: 3, medium: 2, hard: 1 })
    assert.equal(player.filter((q) => themed.has(q.categoryId)).length, 2)
    // 6 slots against 11 categories: every question from a different category.
    assert.equal(new Set(player.map((q) => q.categoryId)).size, 6)
  }
})

test('no question is ever repeated anywhere in a session', () => {
  const { questions } = drawSession(8, profile, themedPerPlayer, fullPool(), 'wedding')
  const all = questions.flat().map((q) => q.id)
  assert.equal(new Set(all).size, all.length)
  assert.equal(all.length, 48)
})

test('each turn ramps easy to medium to hard', () => {
  const { questions } = drawSession(8, profile, themedPerPlayer, fullPool(), 'ramp')
  const rank: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2 }
  for (const player of questions) {
    const ranks = player.map((q) => rank[q.difficulty])
    assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), 'difficulty must never step backwards')
  }
})

test('category order inside a band is shuffled, not lockstep across players', () => {
  const { questions } = drawSession(8, profile, themedPerPlayer, fullPool(), 'shuffle')
  const firstThree = questions.map((p) =>
    p
      .slice(0, 3)
      .map((q) => q.categoryId)
      .join(','),
  )
  assert.ok(new Set(firstThree).size > 1, 'players should not all open with the same category sequence')
})

test('general-category usage stays even across the session', () => {
  const { questions } = drawSession(8, profile, themedPerPlayer, fullPool(), 'even')
  const usage = countBy(
    questions.flat().filter((q) => GENERAL.includes(q.categoryId)),
    (q) => q.categoryId,
  )
  for (const id of GENERAL) usage[id] ??= 0
  const values = Object.values(usage)
  assert.ok(
    Math.max(...values) - Math.min(...values) <= 1,
    `general usage should be within 1, got ${JSON.stringify(usage)}`,
  )
})

test('the same seed reproduces the same session', () => {
  const a = drawSession(8, profile, themedPerPlayer, fullPool(), 'fixed')
  const b = drawSession(8, profile, themedPerPlayer, fullPool(), 'fixed')
  const c = drawSession(8, profile, themedPerPlayer, fullPool(), 'other')
  const ids = (r: typeof a) => r.questions.flat().map((q) => q.id)
  assert.deepEqual(ids(a), ids(b))
  assert.notDeepEqual(ids(a), ids(c))
})

test('survives a stress run of 20 players x 10 questions', () => {
  const bigProfile = { easy: 4, medium: 4, hard: 2 }
  const { questions } = drawSession(20, bigProfile, 3, fullPool(), 'stress')
  const all = questions.flat()
  assert.equal(all.length, 200)
  assert.equal(new Set(all.map((q) => q.id)).size, 200)
  for (const player of questions) {
    assert.deepEqual(countBy(player, (q) => q.difficulty), { easy: 4, medium: 4, hard: 2 })
  }
})

test('degrades gracefully when only three categories are selected', () => {
  const pool = [makeCategory('bib', 'christian'), makeCategory('geo', 'general'), makeCategory('ist', 'general')]
  const feasibility = checkFeasibility(4, profile, themedPerPlayer, pool)
  assert.ok(feasibility.ok, feasibility.errors.join(' '))
  assert.ok(feasibility.warnings.length > 0, 'a repeated category should be flagged up front')

  const { questions } = drawSession(4, profile, themedPerPlayer, pool, 'thin')
  const all = questions.flat()
  assert.equal(new Set(all.map((q) => q.id)).size, all.length, 'still no duplicate questions')
  for (const player of questions) {
    assert.deepEqual(countBy(player, (q) => q.difficulty), { easy: 3, medium: 2, hard: 1 })
  }
})

test('an infeasible config is rejected rather than dealt short', () => {
  // Four hard questions in the themed pool, but 10 players need one each.
  const thin = [
    makeCategory('bib', 'christian', { easy: 40, medium: 40, hard: 1 }),
    makeCategory('geo', 'general', { easy: 40, medium: 40, hard: 1 }),
  ]
  const feasibility = checkFeasibility(10, profile, themedPerPlayer, thin)
  assert.equal(feasibility.ok, false)
  assert.match(feasibility.errors.join(' '), /grele/)
  assert.throws(() => drawSession(10, profile, themedPerPlayer, thin, 'nope'))
})

test('reports the real shortfall, naming counts the host can act on', () => {
  const pool = [makeCategory('bib', 'christian', { easy: 2, medium: 9, hard: 6 }), makeCategory('geo', 'general')]
  const feasibility = checkFeasibility(8, profile, themedPerPlayer, pool)
  assert.equal(feasibility.ok, false)
  assert.match(feasibility.errors.join(' '), /disponibile/)
})
