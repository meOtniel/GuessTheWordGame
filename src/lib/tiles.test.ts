import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildSlots,
  buildTiles,
  chooseHint,
  hintableSlots,
  letterSlots,
  maxHints,
  readPlacement,
  slotWords,
} from '@/lib/tiles'
import { normalizeRo } from '@/lib/normalize'
import type { Slot, Tile } from '@/lib/types'

test('tiles are the answer letters, stripped of diacritics', () => {
  const tiles = buildTiles('credință', 'seed-1')
  assert.equal(tiles.length, 8)
  assert.deepEqual(tiles.map((t) => t.char).sort().join(''), 'ACDEINRT'.split('').sort().join(''))
})

test('repeated letters get distinct tile ids', () => {
  const tiles = buildTiles('mireasa', 'seed-2')
  const aTiles = tiles.filter((t) => t.char === 'A')
  assert.equal(aTiles.length, 2)
  assert.equal(new Set(tiles.map((t) => t.id)).size, tiles.length)
})

test('the same seed always produces the same shuffle', () => {
  const a = buildTiles('betleem', 'seed-3').map((t) => t.id)
  const b = buildTiles('betleem', 'seed-3').map((t) => t.id)
  const c = buildTiles('betleem', 'seed-4').map((t) => t.id)
  assert.deepEqual(a, b, 'a refresh must not reshuffle the board')
  assert.notDeepEqual(a, c)
})

test('multi-word answers get a fixed, non-interactive gap', () => {
  const slots = buildSlots('Marea Roșie')
  assert.equal(slots.length, 11)
  assert.equal(slots[5].kind, 'gap')
  assert.equal(letterSlots(slots).length, 10)
})

test('slots group into one word each, keeping their original indices', () => {
  const words = slotWords(buildSlots('Nunta de aur'))
  assert.deepEqual(
    words.map((w) => w.length),
    [5, 2, 3],
  )
  // Indices must still point into the full answer, gaps included, or a
  // placement would be read back against the wrong letters.
  assert.deepEqual(
    words.map((w) => w.map((s) => s.index)),
    [
      [0, 1, 2, 3, 4],
      [6, 7],
      [9, 10, 11],
    ],
  )
  assert.ok(words.every((w) => w.every((s) => s.kind === 'letter')))
})

test('a single-word answer is one group', () => {
  const words = slotWords(buildSlots('Betleem'))
  assert.equal(words.length, 1)
  assert.equal(words[0].length, 7)
})

test('stray gaps never leave an empty group behind', () => {
  // normalizeRo already collapses spacing, so this feeds slotWords the shape
  // it would have to survive if that ever stopped being true: gaps at both
  // ends and two in a row.
  const words = slotWords([
    { kind: 'gap', index: 0 },
    { kind: 'letter', index: 1 },
    { kind: 'gap', index: 2 },
    { kind: 'gap', index: 3 },
    { kind: 'letter', index: 4 },
    { kind: 'gap', index: 5 },
  ])
  assert.deepEqual(
    words.map((w) => w.map((s) => s.index)),
    [[1], [4]],
  )
})

test('hints can never complete the word', () => {
  assert.equal(maxHints('NOE'), 2)
  assert.equal(maxHints('credință'), 7)
})

test('a hint locks a correct letter into a hidden slot', () => {
  const answer = 'BETLEEM'
  const slots = buildSlots(answer)
  const tiles = buildTiles(answer, 's')
  const hint = chooseHint(answer, slots, {}, {}, tiles)

  assert.ok(hint)
  const tile = tiles.find((t) => t.id === hint.tileId)!
  assert.equal(tile.char, normalizeRo(answer)[hint.slotIndex])
})

test('successive hints never reuse a slot or a tile', () => {
  const answer = 'MIREASA'
  const slots = buildSlots(answer)
  const tiles = buildTiles(answer, 's')
  const revealed: Record<number, string> = {}

  for (let i = 0; i < maxHints(answer); i++) {
    const hint = chooseHint(answer, slots, revealed, {}, tiles)
    assert.ok(hint, `hint ${i} should exist`)
    assert.ok(!(hint.slotIndex in revealed), 'slot already revealed')
    assert.ok(!Object.values(revealed).includes(hint.tileId), 'tile already used')
    revealed[hint.slotIndex] = hint.tileId
  }

  // Every revealed tile still bears the right letter for its slot.
  const normalized = normalizeRo(answer)
  for (const [slotIndex, tileId] of Object.entries(revealed)) {
    const tile = tiles.find((t) => t.id === tileId)!
    assert.equal(tile.char, normalized[Number(slotIndex)])
  }
})

test('readPlacement reconstructs the word from tile ids alone', () => {
  const answer = 'Marea Roșie'
  const slots = buildSlots(answer)
  const tiles = buildTiles(answer, 's')
  const normalized = normalizeRo(answer)

  // Place the correct tile in every letter slot.
  const placement: Record<number, string> = {}
  const pool = [...tiles]
  for (const slot of letterSlots(slots)) {
    const idx = pool.findIndex((t) => t.char === normalized[slot.index])
    placement[slot.index] = pool.splice(idx, 1)[0].id
  }

  assert.equal(readPlacement(slots, placement, tiles), normalized)
})

test('unfilled slots read as placeholders, never as a false match', () => {
  const answer = 'NOE'
  const slots = buildSlots(answer)
  const tiles = buildTiles(answer, 's')
  assert.equal(readPlacement(slots, {}, tiles), '???')
})

// --- hints against a board the player has already worked on -----------------

/** Place the right tile in each of the first `count` letter slots. */
function correctPrefix(answer: string, slots: Slot[], tiles: Tile[], count: number): Record<number, string> {
  const normalized = normalizeRo(answer)
  const pool = [...tiles]
  const placement: Record<number, string> = {}
  for (const slot of letterSlots(slots).slice(0, count)) {
    const at = pool.findIndex((t) => t.char === normalized[slot.index])
    placement[slot.index] = pool.splice(at, 1)[0].id
  }
  return placement
}

test('a hint skips the run of letters the player already has right', () => {
  const answer = 'MIREASA'
  const slots = buildSlots(answer)
  const tiles = buildTiles(answer, 's')
  const placement = correctPrefix(answer, slots, tiles, 4) // M I R E

  const open = hintableSlots(answer, slots, {}, placement, tiles).map((s) => s.index)
  assert.deepEqual(open, [4, 5, 6])

  // The hint lands on the first letter past the player's own work, not inside it.
  const hint = chooseHint(answer, slots, {}, placement, tiles)
  assert.ok(hint)
  assert.equal(hint.slotIndex, 4)
})

test('hints uncover the word from the left, so every letter is worth the same', () => {
  // Deterministic on purpose: a random letter would make one guest pay full
  // price for the opening of the word and the next pay the same for a letter
  // buried in the middle. Same cost has to buy the same help.
  const answer = 'BETLEEM'
  const slots = buildSlots(answer)
  const tiles = buildTiles(answer, 's')
  const revealed: Record<number, string> = {}

  for (let i = 0; i < maxHints(answer); i++) {
    const hint = chooseHint(answer, slots, revealed, {}, tiles)
    assert.ok(hint)
    assert.equal(hint.slotIndex, i, `hint ${i} should have taken the leftmost open slot`)
    revealed[hint.slotIndex] = hint.tileId
  }
})

test('a two-word answer is uncovered straight through the gap', () => {
  const answer = 'NUNTA DE AUR'
  const slots = buildSlots(answer)
  const tiles = buildTiles(answer, 's')
  const revealed: Record<number, string> = {}
  const seen: number[] = []

  for (let i = 0; i < 6; i++) {
    const hint = chooseHint(answer, slots, revealed, {}, tiles)
    assert.ok(hint)
    seen.push(hint.slotIndex)
    revealed[hint.slotIndex] = hint.tileId
  }

  // Slot 5 is the space between NUNTA and DE — never a letter, so never a hint.
  assert.deepEqual(seen, [0, 1, 2, 3, 4, 6])
})

test('a letter that is right only by accident is still hintable', () => {
  // The run stops at the first mistake, so the trailing A is not protected —
  // sparing it would quietly confirm a guess the player cannot yet be sure of.
  const answer = 'MIREASA'
  const slots = buildSlots(answer)
  const tiles = buildTiles(answer, 's')
  const normalized = normalizeRo(answer)

  const placement = correctPrefix(answer, slots, tiles, 4)
  // Slot 4 wants A; give it the S instead, leave slot 5 empty, then park a real
  // A at slot 6 — right, but only by luck, and past the mistake.
  const free = (char: string) => tiles.find((t) => t.char === char && !Object.values(placement).includes(t.id))!
  placement[4] = free('S').id
  placement[6] = free(normalized[6]).id

  assert.deepEqual(hintableSlots(answer, slots, {}, placement, tiles).map((s) => s.index), [4, 5, 6])
})

test('a revealed letter extends the protected run past a gap in the typing', () => {
  const answer = 'NUNTA'
  const slots = buildSlots(answer)
  const tiles = buildTiles(answer, 's')
  const normalized = normalizeRo(answer)

  // The player has N and U; slot 2's N came from an earlier helper letter.
  const placement = correctPrefix(answer, slots, tiles, 2)
  const revealedTile = tiles.find((t) => t.char === normalized[2] && !Object.values(placement).includes(t.id))!
  const revealed = { 2: revealedTile.id }

  assert.deepEqual(hintableSlots(answer, slots, revealed, placement, tiles).map((s) => s.index), [3, 4])
})

test('no hint is left once the player is one letter from the answer', () => {
  // The board submits itself on the last tile, so revealing that slot would be
  // the answer rather than a hint.
  const answer = 'BETLEEM'
  const slots = buildSlots(answer)
  const tiles = buildTiles(answer, 's')
  const placement = correctPrefix(answer, slots, tiles, 6)

  assert.deepEqual(hintableSlots(answer, slots, {}, placement, tiles), [])
  assert.equal(chooseHint(answer, slots, {}, placement, tiles), null)
})

test('a hint never steals a repeated letter out of the correct prefix', () => {
  // 'ANA' has two A tiles. Revealing slot 2 must take the free one, not lift
  // the A the player already placed in slot 0.
  const answer = 'ANA'
  const slots = buildSlots(answer)
  const tiles = buildTiles(answer, 's')
  const placement = correctPrefix(answer, slots, tiles, 1)

  const hint = chooseHint(answer, slots, {}, placement, tiles)
  assert.ok(hint)
  assert.notEqual(hint.tileId, placement[0], 'hint reused the tile sitting in the correct prefix')
  const tile = tiles.find((t) => t.id === hint.tileId)!
  assert.equal(tile.char, normalizeRo(answer)[hint.slotIndex])
})

test('an empty board leaves every letter hintable but the last', () => {
  const answer = 'NOE'
  const slots = buildSlots(answer)
  const tiles = buildTiles(answer, 's')
  assert.equal(hintableSlots(answer, slots, {}, {}, tiles).length, 3)
  assert.equal(hintableSlots(answer, slots, { 0: tiles.find((t) => t.char === 'N')!.id }, {}, tiles).length, 2)
})
