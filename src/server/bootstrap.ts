import type { Category } from '@/lib/types'
import { loadCategories } from './questions'
import { setCategoryLookup } from './session-store'

/**
 * Every route entry point goes through here: it loads (and caches) the
 * datasets and hands the store the category display names it needs, keeping
 * filesystem concerns out of the store itself.
 */
export async function ensureCategories(): Promise<Category[]> {
  const { categories } = await loadCategories()
  setCategoryLookup(categories)
  return categories
}
