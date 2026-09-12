import assert from 'node:assert/strict'
import { test } from 'node:test'
import { answerLetters, answersMatch, normalizeRo } from '@/lib/normalize'

test('strips every Romanian diacritic', () => {
  assert.equal(normalizeRo('credință'), 'CREDINTA')
  assert.equal(normalizeRo('mireasă'), 'MIREASA')
  assert.equal(normalizeRo('jurământ'), 'JURAMANT')
  assert.equal(normalizeRo('înviere'), 'INVIERE')
  assert.equal(normalizeRo('Ștefan'), 'STEFAN')
})

test('treats comma-below and legacy cedilla forms as the same letter', () => {
  // U+0219 (s-comma, correct) vs U+015F (s-cedilla, legacy Windows encoding).
  assert.equal(normalizeRo('știință'), normalizeRo('ştiinţă'))
  assert.equal(normalizeRo('știință'), 'STIINTA')
})

test('collapses case and whitespace', () => {
  assert.equal(normalizeRo('  Marea   Roșie  '), 'MAREA ROSIE')
})

test('answersMatch forgives diacritics and case', () => {
  assert.ok(answersMatch('credință', 'CREDINTA'))
  assert.ok(answersMatch('Marea Roșie', 'marea rosie'))
  assert.ok(!answersMatch('credință', 'credinta.'))
  assert.ok(!answersMatch('NOE', 'NOI'))
})

test('answerLetters drops spaces but keeps duplicates', () => {
  assert.deepEqual(answerLetters('Marea Roșie'), ['M', 'A', 'R', 'E', 'A', 'R', 'O', 'S', 'I', 'E'])
  assert.equal(answerLetters('mireasă').length, 7)
})
