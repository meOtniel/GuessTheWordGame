import { answerLetters, normalizeRo } from './normalize'
import { makeRng, shuffle } from './rng'
import type { Slot, Tile } from './types'

/**
 * Slots mirror the normalised answer: one 'letter' slot per letter, plus a
 * fixed 'gap' for each space in a multi-word answer. Gaps are rendered but
 * never interactive, so the player only ever fills letters.
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
 * Reveal one more letter: pick a random still-hidden letter slot, then lock a
 * tile bearing the right character into it. Any tile already sitting in that
 * slot is the caller's problem to bounce back to the pool.
 *
 * Returns null when there is nothing left that may be revealed.
 */
export function chooseHint(
  answer: string,
  slots: Slot[],
  revealedSlots: Record<number, string>,
  tiles: Tile[],
  seed: string,
): HintResult | null {
  const normalized = normalizeRo(answer)
  const hidden = letterSlots(slots).filter((s) => !(s.index in revealedSlots))
  if (hidden.length === 0) return null

  const rng = makeRng(seed)
  const target = hidden[Math.floor(rng() * hidden.length)]
  const wanted = normalized[target.index]

  const taken = new Set(Object.values(revealedSlots))
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
