import { NextResponse } from 'next/server'
import { loadCategories, summarise } from '@/server/questions'
import { setCategoryLookup } from '@/server/session-store'
import { DEFAULT_CONFIG } from '@/server/defaults'

export const dynamic = 'force-dynamic'

export async function GET() {
  // force=true so edits to the JSON files show up without restarting the app —
  // the host may be tweaking questions right up to the reception.
  const { categories, issues } = await loadCategories(true)
  setCategoryLookup(categories)
  return NextResponse.json({
    categories: summarise(categories),
    issues,
    defaults: DEFAULT_CONFIG,
  })
}
