'use client'

import { AdminLive } from '@/components/AdminLive'
import { AdminSetup } from '@/components/AdminSetup'
import { useSession } from '@/lib/useSession'

export default function AdminPage() {
  // host: true — this is the moderator console, the one screen that is shown
  // the answer so the host can judge a spoken guess.
  const { state, actions, refresh } = useSession({ host: true })

  if (!state) {
    return <main className="flex min-h-screen items-center justify-center">Se încarcă…</main>
  }

  async function reset() {
    const res = await fetch('/api/session', { method: 'DELETE' })
    const data = await res.json()
    refresh(data.state)
  }

  if (state.phase === 'idle') {
    return <AdminSetup onCreated={refresh} />
  }

  return <AdminLive state={state} actions={actions} onReset={() => void reset()} />
}
