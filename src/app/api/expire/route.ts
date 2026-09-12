import { NextResponse } from 'next/server'
import { ensureCategories } from '@/server/bootstrap'
import { expireQuestion } from '@/server/session-store'

export const dynamic = 'force-dynamic'

/** The client reports its countdown hit zero; the server verifies before acting. */
export async function POST() {
  await ensureCategories()
  return NextResponse.json({ state: expireQuestion() })
}
