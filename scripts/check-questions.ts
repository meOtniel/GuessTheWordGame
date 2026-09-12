/**
 * Dataset health check:  npm run check:questions
 *
 * Validates every file in data/questions and reports the shape of the pool,
 * so a bad edit the night before the wedding is caught at the terminal rather
 * than on the setup screen.
 */
import { DEFAULT_CONFIG } from '../src/server/defaults'
import { checkFeasibility } from '../src/server/draw'
import { countByDifficulty, loadCategories } from '../src/server/questions'
import { answerLetters, normalizeRo } from '../src/lib/normalize'
import { DIFFICULTIES, type Difficulty, type Theme } from '../src/lib/types'

const pad = (s: string, n: number) => s.padEnd(n)
const padL = (s: string | number, n: number) => String(s).padStart(n)

async function main() {
  const { categories, issues } = await loadCategories(true)

  if (issues.length > 0) {
    console.log('\nPROBLEME\n')
    for (const issue of issues) console.log(`  ${issue.file}: ${issue.message}`)
  }

  if (categories.length === 0) {
    console.error('\nNicio categorie validă în data/questions. Oprit.\n')
    process.exitCode = 1
    return
  }

  // Category x difficulty matrix
  console.log('\nCATEGORII\n')
  console.log(`  ${pad('categorie', 26)}${pad('temă', 11)}${padL('ușor', 6)}${padL('mediu', 7)}${padL('greu', 6)}${padL('total', 7)}`)
  console.log(`  ${'-'.repeat(63)}`)

  const totals: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0 }
  const byTheme: Record<Theme, Record<Difficulty, number>> = {
    christian: { easy: 0, medium: 0, hard: 0 },
    general: { easy: 0, medium: 0, hard: 0 },
  }

  for (const category of categories) {
    const counts = countByDifficulty(category)
    for (const d of DIFFICULTIES) {
      totals[d] += counts[d]
      byTheme[category.theme][d] += counts[d]
    }
    const thin = category.questions.length < 21 ? '  (subțire)' : ''
    console.log(
      `  ${pad(category.id, 26)}${pad(category.theme, 11)}${padL(counts.easy, 6)}${padL(counts.medium, 7)}${padL(counts.hard, 6)}${padL(category.questions.length, 7)}${thin}`,
    )
  }

  console.log(`  ${'-'.repeat(63)}`)
  const grand = totals.easy + totals.medium + totals.hard
  console.log(`  ${pad('TOTAL', 37)}${padL(totals.easy, 6)}${padL(totals.medium, 7)}${padL(totals.hard, 6)}${padL(grand, 7)}`)
  console.log(`  ${pad('tematice', 37)}${padL(byTheme.christian.easy, 6)}${padL(byTheme.christian.medium, 7)}${padL(byTheme.christian.hard, 6)}`)
  console.log(`  ${pad('generale', 37)}${padL(byTheme.general.easy, 6)}${padL(byTheme.general.medium, 7)}${padL(byTheme.general.hard, 6)}`)

  // Answer shape — long answers make for an unwieldy tile board.
  const all = categories.flatMap((c) => c.questions)
  const lengths = all.map((q) => answerLetters(q.answer).length)
  const histogram = new Map<number, number>()
  for (const len of lengths) histogram.set(len, (histogram.get(len) ?? 0) + 1)

  console.log('\nLUNGIMEA RĂSPUNSURILOR\n')
  for (const len of [...histogram.keys()].sort((a, b) => a - b)) {
    console.log(`  ${padL(len, 2)} litere  ${'#'.repeat(histogram.get(len)!)} ${histogram.get(len)}`)
  }
  const longest = all.filter((q) => answerLetters(q.answer).length >= 15)
  if (longest.length > 0) {
    console.log('\n  Răspunsuri lungi (15 litere sau mai mult — verifică pe ecranul de joc):')
    for (const q of longest) console.log(`    ${q.id}  ${q.answer}`)
  }

  // Two questions with the same answer would feel like a repeat to a guest,
  // even though the draw sees them as distinct questions.
  const byAnswer = new Map<string, string[]>()
  for (const q of all) {
    const key = normalizeRo(q.answer)
    byAnswer.set(key, [...(byAnswer.get(key) ?? []), q.id])
  }
  const duplicates = [...byAnswer.entries()].filter(([, ids]) => ids.length > 1)
  if (duplicates.length > 0) {
    console.log('\nRĂSPUNSURI DUPLICATE\n')
    for (const [answer, ids] of duplicates) console.log(`  ${pad(answer, 20)} ${ids.join(', ')}`)
  }

  // How big a session can this pool support at the default profile?
  const { profile, themedPerPlayer } = DEFAULT_CONFIG
  let maxPlayers = 0
  for (let p = 1; p <= 200; p++) {
    if (!checkFeasibility(p, profile, themedPerPlayer, categories).ok) break
    maxPlayers = p
  }

  const perPlayer = DIFFICULTIES.reduce((s, d) => s + profile[d], 0)
  console.log('\nCAPACITATE\n')
  console.log(`  Profil implicit: ${profile.easy} ușoare / ${profile.medium} medii / ${profile.hard} grele  (${perPlayer} întrebări per jucător)`)
  console.log(`  Maxim jucători cu toate categoriile: ${maxPlayers}`)

  const target = checkFeasibility(8, profile, themedPerPlayer, categories)
  console.log(`  Configurația țintă (8 jucători x ${perPlayer}): ${target.ok ? 'OK' : 'INSUFICIENT'}  — ${8 * perPlayer} din ${grand} întrebări folosite`)
  for (const w of target.warnings) console.log(`    atenție: ${w}`)
  for (const e of target.errors) console.log(`    eroare: ${e}`)

  console.log('')
  if (issues.length > 0) process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
