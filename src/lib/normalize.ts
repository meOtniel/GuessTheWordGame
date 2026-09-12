/**
 * Romanian text handling.
 *
 * Answers are authored with diacritics ("credință") because that is what the
 * reveal screen should show. Everything mechanical — letter tiles, comparison —
 * runs on the stripped form, so a guest is never punished for ș vs s, and the
 * tile pool is plain A-Z regardless of how the dataset was typed.
 *
 * NFD decomposition puts the breve (ă), circumflex (â, î), comma-below (ș, ț)
 * and the legacy cedilla forms (ş, ţ) all in the U+0300-U+036F combining block,
 * so a single range strips every Romanian diacritic at once.
 */

export function normalizeRo(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** True when two answers match once diacritics, case and spacing are ignored. */
export function answersMatch(a: string, b: string): boolean {
  return normalizeRo(a) === normalizeRo(b)
}

/** Letters only, in answer order — the exact multiset the tile pool is built from. */
export function answerLetters(answer: string): string[] {
  return normalizeRo(answer).split('').filter((c) => c !== ' ')
}
