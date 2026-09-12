/**
 * Romanian numeral agreement.
 *
 * 1 takes the singular, 2–19 take the plural, and from 20 up the plural needs
 * "de" in front of it ("20 de ajutoare"). The rule restarts on the last two
 * digits, so 101 goes back to the bare plural ("101 întrebări").
 *
 * Zero takes the plural without "de" ("0 întrebări").
 *
 * This lives in lib rather than in the UI because the setup checks build the
 * same counted phrases on the server.
 */
export function pluralWord(count: number, one: string, few: string): string {
  const n = Math.abs(count)
  if (n === 1) return one
  if (n === 0) return few
  const lastTwo = n % 100
  if (lastTwo >= 1 && lastTwo <= 19) return few
  return `de ${few}`
}

/** The count and its noun, agreed: `plural(3, 'întrebare', 'întrebări')`. */
export function plural(count: number, one: string, few: string): string {
  return `${count} ${pluralWord(count, one, few)}`
}
