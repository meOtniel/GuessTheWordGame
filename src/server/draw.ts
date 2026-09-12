import { plural } from '@/lib/plural'
import { makeRng, shuffle, type Rng } from '@/lib/rng'
import { DIFFICULTIES, type ByDifficulty, type Category, type Difficulty, type Question, type Theme } from '@/lib/types'

/** One question-shaped hole in a player's turn, before a category is chosen. */
export interface SlotSpec {
  difficulty: Difficulty
  theme: Theme
}

/**
 * Lay out every player's slots.
 *
 * The difficulty profile is identical for everyone. Which of those slots carry
 * the themed (biblical/wedding) questions rotates per player, with the themed
 * slots kept a stride apart so they don't both land on the easy band —
 * otherwise the scripture content would be permanently parked on the warm-up
 * questions.
 */
export function planSlots(playerCount: number, profile: ByDifficulty<number>, themedPerPlayer: number): SlotSpec[][] {
  const order: Difficulty[] = []
  for (const d of DIFFICULTIES) for (let i = 0; i < profile[d]; i++) order.push(d)

  const n = order.length
  const themed = Math.max(0, Math.min(themedPerPlayer, n))
  const stride = themed > 0 ? Math.max(1, Math.round(n / themed)) : 1

  return Array.from({ length: playerCount }, (_, playerIndex) => {
    const themedPositions = new Set<number>()
    for (let k = 0; themedPositions.size < themed && k < n * 2; k++) {
      themedPositions.add((playerIndex + k * stride) % n)
    }
    return order.map((difficulty, slotIndex) => ({
      difficulty,
      theme: (themedPositions.has(slotIndex) ? 'christian' : 'general') as Theme,
    }))
  })
}

export type Demand = Record<Theme, ByDifficulty<number>>

const emptyCounts = (): ByDifficulty<number> => ({ easy: 0, medium: 0, hard: 0 })

export function demandOf(plan: SlotSpec[][]): Demand {
  const demand: Demand = { christian: emptyCounts(), general: emptyCounts() }
  for (const player of plan) for (const slot of player) demand[slot.theme][slot.difficulty]++
  return demand
}

export function supplyOf(categories: Category[]): Demand {
  const supply: Demand = { christian: emptyCounts(), general: emptyCounts() }
  for (const c of categories) for (const q of c.questions) supply[c.theme][q.difficulty]++
  return supply
}

export interface Feasibility {
  ok: boolean
  errors: string[]
  warnings: string[]
  demand: Demand
  supply: Demand
}

// Both numbers are needed: these labels qualify "întrebare"/"categorie", which
// the counted phrases around them may render in either form.
const THEME_LABEL: Record<Theme, string> = { christian: 'tematice', general: 'generale' }
const THEME_LABEL_ONE: Record<Theme, string> = { christian: 'tematică', general: 'generală' }
const DIFF_LABEL: Record<Difficulty, string> = { easy: 'ușoare', medium: 'medii', hard: 'grele' }
const DIFF_LABEL_ONE: Record<Difficulty, string> = { easy: 'ușoară', medium: 'medie', hard: 'grea' }

const themeWord = (theme: Theme, count: number) =>
  count === 1 ? THEME_LABEL_ONE[theme] : THEME_LABEL[theme]
const diffWord = (difficulty: Difficulty, count: number) =>
  count === 1 ? DIFF_LABEL_ONE[difficulty] : DIFF_LABEL[difficulty]

/**
 * Answered before a single question is dealt, so a shortfall shows up on the
 * setup screen rather than on the sixth guest's turn.
 */
export function checkFeasibility(
  playerCount: number,
  profile: ByDifficulty<number>,
  themedPerPlayer: number,
  categories: Category[],
): Feasibility {
  const plan = planSlots(playerCount, profile, themedPerPlayer)
  const demand = demandOf(plan)
  const supply = supplyOf(categories)
  const errors: string[] = []
  const warnings: string[] = []

  if (playerCount < 1) errors.push('Adaugă cel puțin un jucător.')
  const perPlayer = DIFFICULTIES.reduce((s, d) => s + profile[d], 0)
  if (perPlayer < 1) errors.push('Fiecare jucător are nevoie de cel puțin o întrebare.')

  for (const theme of ['christian', 'general'] as Theme[]) {
    for (const d of DIFFICULTIES) {
      const need = demand[theme][d]
      const have = supply[theme][d]
      if (need > have) {
        errors.push(
          `Nevoie de ${plural(need, 'întrebare', 'întrebări')} ${diffWord(d, need)} ${themeWord(theme, need)}` +
            `, disponibile ${have}.`,
        )
      }
    }
  }

  // Variety warning: fewer categories in a class than that class's slots per
  // player means some player must draw the same category twice.
  for (const theme of ['christian', 'general'] as Theme[]) {
    const slotsPerPlayer = plan[0]?.filter((s) => s.theme === theme).length ?? 0
    const available = categories.filter((c) => c.theme === theme).length
    if (slotsPerPlayer > available && available > 0) {
      warnings.push(
        `Doar ${plural(available, 'categorie', 'categorii')} ${themeWord(theme, available)} pentru ` +
          `${plural(slotsPerPlayer, 'întrebare', 'întrebări')} ${themeWord(theme, slotsPerPlayer)}/jucător` +
          ' — o categorie se va repeta.',
      )
    }
  }

  return { ok: errors.length === 0, errors, warnings, demand, supply }
}

interface Cell {
  categoryId: string
  theme: Theme
  pool: Question[]
}

/** remaining[categoryId][difficulty] — shuffled once, then popped from the end. */
function buildCells(categories: Category[], rng: Rng): Map<string, ByDifficulty<Cell>> {
  const cells = new Map<string, ByDifficulty<Cell>>()
  for (const c of categories) {
    const byDiff = {} as ByDifficulty<Cell>
    for (const d of DIFFICULTIES) {
      byDiff[d] = {
        categoryId: c.id,
        theme: c.theme,
        pool: shuffle(
          c.questions.filter((q) => q.difficulty === d),
          rng,
        ),
      }
    }
    cells.set(c.id, byDiff)
  }
  return cells
}

export interface DrawResult {
  /** questions[playerIndex] — ordered easy -> medium -> hard. */
  questions: Question[][]
  warnings: string[]
}

/**
 * Deal every player's questions up front.
 *
 * The load-bearing choice is "most remaining first": among the categories that
 * could fill a slot, take from the one with the deepest pool at that
 * difficulty. Thin cells (a hard band holds only ~6 questions) are left in
 * reserve, which is what stops the deal running dry partway through and
 * degrading into repeats.
 */
export function drawSession(
  playerCount: number,
  profile: ByDifficulty<number>,
  themedPerPlayer: number,
  categories: Category[],
  seed: string,
): DrawResult {
  const feasibility = checkFeasibility(playerCount, profile, themedPerPlayer, categories)
  if (!feasibility.ok) throw new Error(feasibility.errors.join(' '))

  const rng = makeRng(seed)
  const plan = planSlots(playerCount, profile, themedPerPlayer)
  const cells = buildCells(categories, rng)
  const globalUsage = new Map<string, number>(categories.map((c) => [c.id, 0]))
  const catOrder = categories.map((c) => c.id)
  const warnings = [...feasibility.warnings]

  const questions: Question[][] = []

  for (let playerIndex = 0; playerIndex < playerCount; playerIndex++) {
    const drawn: Question[] = []
    const usedCategories = new Set<string>()

    for (const slot of plan[playerIndex]) {
      const eligible = (theme: Theme, respectVariety: boolean) =>
        categories.filter(
          (c) =>
            c.theme === theme &&
            cells.get(c.id)![slot.difficulty].pool.length > 0 &&
            (!respectVariety || !usedCategories.has(c.id)),
        )

      let candidates = eligible(slot.theme, true)
      if (candidates.length === 0) candidates = eligible(slot.theme, false)
      if (candidates.length === 0) {
        // Last resort: borrow from the other theme class rather than hand the
        // player a short turn. Feasibility normally prevents ever getting here.
        const other: Theme = slot.theme === 'christian' ? 'general' : 'christian'
        candidates = eligible(other, false)
        if (candidates.length > 0) {
          warnings.push(
            `Rezervă epuizată pentru o întrebare ${DIFF_LABEL_ONE[slot.difficulty]} ${THEME_LABEL_ONE[slot.theme]}` +
              ` — s-a folosit o categorie ${THEME_LABEL_ONE[other]}.`,
          )
        }
      }
      if (candidates.length === 0) {
        throw new Error('Nu mai există întrebări ' + DIFF_LABEL[slot.difficulty] + ' disponibile.')
      }

      const best = candidates
        .map((c) => ({
          category: c,
          remaining: cells.get(c.id)![slot.difficulty].pool.length,
          usage: globalUsage.get(c.id) ?? 0,
          // Rotation: each player starts scanning the category list from a
          // different offset, so ties don't always resolve the same way.
          rotation: (catOrder.indexOf(c.id) - playerIndex + catOrder.length * 2) % catOrder.length,
        }))
        .sort((a, b) => b.remaining - a.remaining || a.usage - b.usage || a.rotation - b.rotation)[0]

      const question = cells.get(best.category.id)![slot.difficulty].pool.pop()!
      globalUsage.set(best.category.id, (globalUsage.get(best.category.id) ?? 0) + 1)
      usedCategories.add(best.category.id)
      drawn.push(question)
    }

    // Ramp easy -> medium -> hard, but shuffle inside each band so eight
    // consecutive turns don't march through the categories in lockstep.
    const ordered = DIFFICULTIES.flatMap((d) =>
      shuffle(
        drawn.filter((q) => q.difficulty === d),
        rng,
      ),
    )
    questions.push(ordered)
  }

  return { questions, warnings: [...new Set(warnings)] }
}
