import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { answerLetters } from '@/lib/normalize'
import { plural } from '@/lib/plural'
import { DIFFICULTIES, type Category, type Difficulty, type Question, type Theme } from '@/lib/types'

export const QUESTIONS_DIR = path.join(process.cwd(), 'data', 'questions')

const questionSchema = z.object({
  id: z.string().min(1),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  prompt: z.string().min(10),
  answer: z.string().min(1),
})

const categorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  theme: z.enum(['christian', 'general']),
  icon: z.string().min(1),
  questions: z.array(questionSchema).min(1),
})

export interface LoadIssue {
  file: string
  message: string
}

export interface LoadResult {
  categories: Category[]
  issues: LoadIssue[]
}

let cache: LoadResult | null = null

/**
 * Read every dataset in data/questions. The directory is globbed rather than
 * listed in code, so adding a category is just dropping in a JSON file.
 */
export async function loadCategories(force = false): Promise<LoadResult> {
  if (cache && !force) return cache

  const files = (await readdir(QUESTIONS_DIR)).filter((f) => f.endsWith('.json')).sort()
  const categories: Category[] = []
  const issues: LoadIssue[] = []
  const seenQuestionIds = new Set<string>()

  for (const file of files) {
    const raw = await readFile(path.join(QUESTIONS_DIR, file), 'utf8')
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (err) {
      issues.push({ file, message: `JSON invalid: ${(err as Error).message}` })
      continue
    }

    const result = categorySchema.safeParse(parsed)
    if (!result.success) {
      for (const issue of result.error.issues) {
        issues.push({ file, message: `${issue.path.join('.') || '(rădăcină)'}: ${issue.message}` })
      }
      continue
    }

    const data = result.data
    const questions: Question[] = []

    for (const q of data.questions) {
      if (seenQuestionIds.has(q.id)) {
        issues.push({ file, message: `id duplicat "${q.id}"` })
        continue
      }
      const letters = answerLetters(q.answer).length
      if (letters < 4 || letters > 16) {
        issues.push({
          file,
          message: `"${q.id}": răspunsul "${q.answer}" are ${plural(letters, 'literă', 'litere')} (4-16 permise)`,
        })
        continue
      }
      seenQuestionIds.add(q.id)
      questions.push({ ...q, categoryId: data.id })
    }

    categories.push({ id: data.id, name: data.name, theme: data.theme, icon: data.icon, questions })
  }

  cache = { categories, issues }
  return cache
}

/** Count of questions per difficulty in a category. */
export function countByDifficulty(category: Category): Record<Difficulty, number> {
  const counts: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0 }
  for (const q of category.questions) counts[q.difficulty]++
  return counts
}

export interface CategorySummary {
  id: string
  name: string
  theme: Theme
  icon: string
  total: number
  counts: Record<Difficulty, number>
}

export function summarise(categories: Category[]): CategorySummary[] {
  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    theme: c.theme,
    icon: c.icon,
    total: c.questions.length,
    counts: countByDifficulty(c),
  }))
}

/** Flat pool for the categories the host selected. */
export function poolFor(categories: Category[], categoryIds: string[]): Category[] {
  const wanted = new Set(categoryIds)
  return categories.filter((c) => wanted.has(c.id))
}

export const ALL_DIFFICULTIES = DIFFICULTIES
