import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildSlots, buildTiles, chooseHint, letterSlots, maxHints, readPlacement } from '@/lib/tiles'
import { normalizeRo } from '@/lib/normalize'

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

test('hints can never complete the word', () => {
  assert.equal(maxHints('NOE'), 2)
  assert.equal(maxHints('credință'), 7)
})

test('a hint locks a correct letter into a hidden slot', () => {
  const answer = 'BETLEEM'
  const slots = buildSlots(answer)
  const tiles = buildTiles(answer, 's')
  const hint = chooseHint(answer, slots, {}, tiles, 'h1')

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
    const hint = chooseHint(answer, slots, revealed, tiles, `h${i}`)
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
