'use client'

import Link from 'next/link'
import { Leaderboard } from '@/components/Leaderboard'
import { Button, Card } from '@/components/ui'
import { useSession } from '@/lib/useSession'

export default function HomePage() {
  const { state } = useSession()
  // Three states, not two: a finished session offers nothing to "continue",
  // and saying so is what sends people hunting for the new-game button.
  const finished = state?.phase === 'finished'
  const inProgress = state !== null && state.phase !== 'idle' && !finished

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-8 px-6 py-12 text-center">
      <div>
        <h1 className="font-display text-plum text-5xl font-bold sm:text-6xl">Ghicește Cuvântul</h1>
        <p className="text-ink-soft mt-3 text-lg">Un joc pentru invitații de la nuntă</p>
      </div>

      <div className="flex w-full flex-col gap-3 sm:max-w-sm">
        <Link href="/admin" className="w-full">
          <Button size="lg" className="w-full">
            {inProgress ? 'Continuă sesiunea' : 'Sesiune nouă'}
          </Button>
        </Link>
        {finished && (
          <p className="text-ink-soft -mt-1 text-sm">
            Sesiunea trecută s-a încheiat. Clasamentul de mai jos rămâne salvat.
          </p>
        )}
        <Link href="/play" className="w-full">
          <Button variant="secondary" size="lg" className="w-full">
            Ecranul jucătorului
          </Button>
        </Link>
        <Link href="/display" className="w-full" target="_blank">
          <Button variant="secondary" size="lg" className="w-full">
            Ecranul proiectorului
          </Button>
        </Link>
      </div>

      {state?.lastSession && (
        <Card className="w-full">
          <h2 className="font-display mb-4 text-xl font-bold">Clasamentul sesiunii trecute</h2>
          <Leaderboard rows={state.lastSession.rows} />
        </Card>
      )}
    </main>
  )
}
