import { answerLetters, normalizeRo } from './normalize'
import { makeRng, shuffle } from './rng'
import type { Slot, Tile } from './types'

/**
 * Slots mirror the normalised answer: one 'letter' slot per letter, plus a
 * fixed 'gap' for each space in a multi-word answer. Gaps are never
 * interactive — they only mark where one word ends and the next begins, so the
 * player only ever fills letters.
 */
export function buildSlots(answer: string): Slot[] {
  return normalizeRo(answer)
    .split('')
    .map((char, index) => (char === ' ' ? { kind: 'gap' as const, index } : { kind: 'letter' as const, index }))
}

/**
 * The scrambled pool. Tiles carry unique ids rather than bare characters so
 * repeated letters ("MIREASA" has three A's) stay individually addressable.
 */
export function buildTiles(answer: string, seed: string): Tile[] {
  const letters = answerLetters(answer)
  const tiles = letters.map((char, i) => ({ id: `t${i}`, char }))
  return shuffle(tiles, makeRng(seed))
}

/** Letter slots only, in reading order. */
export function letterSlots(slots: Slot[]): Slot[] {
  return slots.filter((s) => s.kind === 'letter')
}

/**
 * The letter slots split into one group per word, so a board can keep each
 * word together instead of letting a long answer wrap wherever it likes.
 * "NUNTA DE AUR" gives the player three visible groups of 5, 2 and 3 — a small
 * leg-up that the bare letter count never offered.
 *
 * Single-word answers come back as one group, which renders exactly as before.
 */
export function slotWords(slots: Slot[]): Slot[][] {
  const words: Slot[][] = [[]]
  for (const slot of slots) {
    if (slot.kind === 'gap') words.push([])
    else words[words.length - 1].push(slot)
  }
  // Leading, trailing or doubled spaces would otherwise leave empty groups
  // behind, each drawing a gap the player can't account for.
  return words.filter((word) => word.length > 0)
}

/**
 * A hint can never complete the word — at most all-but-one letter is ever
 * given away, so the final letter is always the player's own.
 */
export function maxHints(answer: string): number {
  return Math.max(0, answerLetters(answer).length - 1)
}

export interface HintResult {
  slotIndex: number
  tileId: string
}

/**
 * The letter slots a helper letter may still be spent on.
 *
 * Two things are off limits. Letters already revealed, obviously — and the
 * unbroken run of correct letters the player has tapped in from the left,
 * because paying full price to be told the first letter of a word you have
 * already half-built is no help at all. The run is read in reading order and
 * ends at the first empty or wrong slot: a letter that happens to be right
 * *after* a mistake stays fair game, since skipping it would quietly confirm
 * a guess the player has no business being sure of yet.
 *
 * Comes back empty when a single unknown slot is left. A helper letter may
 * never complete the word, and because the board submits itself the moment the
 * last tile lands, revealing that slot would not be a hint — it would be the
 * answer.
 */
export function hintableSlots(
  answer: string,
  slots: Slot[],
  revealedSlots: Record<number, string>,
  placement: Record<number, string>,
  tiles: Tile[],
): Slot[] {
  const normalized = normalizeRo(answer)
  const byId = new Map(tiles.map((t) => [t.id, t.char]))
  const letters = letterSlots(slots)
  // Revealed letters outrank whatever the player had in that slot — the tablet
  // bounces the loser back to the pool as soon as a hint lands.
  const settled = { ...placement, ...revealedSlots }

  let correct = 0
  while (correct < letters.length) {
    const { index } = letters[correct]
    const tileId = settled[index]
    if (!tileId || byId.get(tileId) !== normalized[index]) break
    correct++
  }

  const open = letters.slice(correct).filter((s) => !(s.index in revealedSlots))
  return open.length > 1 ? open : []
}

/**
 * Reveal one more letter: always the leftmost slot still open to a hint, then
 * lock a tile bearing the right character into it. Any tile already sitting in
 * that slot is the caller's problem to bounce back to the pool.
 *
 * Left to right, not at random, and that is the whole point. A random letter
 * makes one guest pay full price for the opening of the word and the next pay
 * the same for an I buried in the middle — identical cost, wildly different
 * help, decided by luck. Uncovering from the left gives every letter the same
 * worth to everyone, which is the only thing that makes charging a fixed share
 * for it honest. It also reads far better on the projector: the word builds
 * from its first letter instead of sprouting in patches.
 *
 * Returns null when there is nothing left that may be revealed.
 */
export function chooseHint(
  answer: string,
  slots: Slot[],
  revealedSlots: Record<number, string>,
  placement: Record<number, string>,
  tiles: Tile[],
): HintResult | null {
  const normalized = normalizeRo(answer)
  // hintableSlots keeps reading order, so the head of the list is the first
  // letter the player does not already have.
  const [target, ...rest] = hintableSlots(answer, slots, revealedSlots, placement, tiles)
  if (!target) return null

  const candidates = [target, ...rest]
  const wanted = normalized[target.index]

  // Every slot outside the candidate list already holds the letter it should —
  // revealed or correctly placed — so those tiles are spoken for. Without this,
  // a repeated letter ("ANA") would let the hint yank the A the player got
  // right out of its slot to satisfy the A it just chose to give away.
  const taken = new Set<string>()
  const candidateIndexes = new Set(candidates.map((s) => s.index))
  for (const [slot, tileId] of Object.entries({ ...placement, ...revealedSlots })) {
    if (!candidateIndexes.has(Number(slot))) taken.add(tileId)
  }

  const tile = tiles.find((t) => t.char === wanted && !taken.has(t.id))
  if (!tile) return null

  return { slotIndex: target.index, tileId: tile.id }
}

/**
 * Rebuild the answer the player has assembled, given which tile sits in which
 * slot. Runs server-side: the client only ever sends tile ids, so the plain
 * answer never reaches the browser before the reveal.
 */
export function readPlacement(slots: Slot[], placement: Record<number, string>, tiles: Tile[]): string {
  const byId = new Map(tiles.map((t) => [t.id, t.char]))
  return slots
    .map((slot) => {
      if (slot.kind === 'gap') return ' '
      const tileId = placement[slot.index]
      return tileId ? (byId.get(tileId) ?? '?') : '?'
    })
    .join('')
}
