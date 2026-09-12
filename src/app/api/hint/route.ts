import { NextResponse } from 'next/server'
import { ensureCategories } from '@/server/bootstrap'
import { requestHint } from '@/server/session-store'

export const dynamic = 'force-dynamic'

export async function POST() {
  await ensureCategories()
  return NextResponse.json({ state: requestHint() })
}
