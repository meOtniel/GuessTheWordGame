'use client'

import { CountdownRing } from '@/components/CountdownRing'
import { Leaderboard, Podium } from '@/components/Leaderboard'
import { DifficultyBadge } from '@/components/ui'
import { slotWords } from '@/lib/tiles'
import { useCountdown, useSession } from '@/lib/useSession'
import type { PublicQuestion } from '@/lib/types'

/**
 * The audience screen: read-only, no controls, everything sized to be read
 * from the back of a reception hall.
 *
 * It deliberately shows the scrambled pool and any revealed letters — but not
 * the tiles the player has placed — so the room can play along without seeing
 * over the guest's shoulder.
 */
export default function DisplayPage() {
  const { state } = useSession()
  const question = state?.question ?? null
  const running = state?.phase === 'question' && !state.paused
  const remaining = useCountdown(question?.remainingMs ?? null, running)

  if (!state) return <Screen>Se încarcă…</Screen>

  if (state.phase === 'idle') {
    return (
      <Screen>
        <h1 className="font-display text-plum mb-4 text-7xl font-bold">Ghicește Cuvântul</h1>
        {state.lastSession ? (
          <div className="w-full max-w-5xl">
            <p className="text-ink-soft mb-6 text-2xl">Clasamentul sesiunii trecute</p>
            <Leaderboard rows={state.lastSession.rows} big />
          </div>
        ) : (
          <p className="text-ink-soft text-3xl">Așteptăm începerea jocului…</p>
        )}
      </Screen>
    )
  }

  if (state.phase === 'lobby') {
    return (
      <Screen>
        <p className="text-ink-soft text-4xl">Urmează</p>
        <h1 className="font-display text-plum my-8 text-8xl font-bold">{state.currentPlayer?.name}</h1>
        {state.leaderboard.some((r) => r.points > 0) && (
          <div className="mt-8 w-full max-w-5xl">
            <Leaderboard rows={state.leaderboard} highlightId={state.currentPlayer?.id} />
          </div>
        )}
      </Screen>
    )
  }

  if (state.phase === 'question' && question) {
    return (
      <main className="flex min-h-screen flex-col px-10 py-8">
        <header className="flex items-center justify-between gap-8">
          <div>
            <p className="font-display text-plum text-5xl font-bold">{state.currentPlayer?.name}</p>
            <p className="text-ink-soft mt-2 flex items-center gap-3 text-2xl">
              <span>{question.categoryIcon}</span>
              {question.categoryName}
              <DifficultyBadge difficulty={question.difficulty} timeoutSec={question.timeoutSec} />
            </p>
          </div>
          <div className="text-right">
            <p className="text-ink-soft text-xl">
              Întrebarea {question.number} / {question.total}
            </p>
          </div>
          <CountdownRing remainingMs={remaining} totalMs={question.timeoutSec * 1000} size={150} paused={state.paused} />
        </header>

        <p className="font-display my-12 text-center text-5xl leading-tight xl:text-6xl">{question.prompt}</p>

        <AudienceBoard question={question} />
      </main>
    )
  }

  if (state.phase === 'reveal' && state.reveal) {
    const { correct, answer, points } = state.reveal
    return (
      <Screen>
        <p className={`font-display text-7xl font-bold ${correct ? 'text-easy' : 'text-hard'}`}>
          {correct ? `Bravo, ${state.currentPlayer?.name}!` : 'Timpul a expirat'}
        </p>
        <p className="text-ink-soft mt-10 text-3xl">Răspunsul era</p>
        <p className="font-display text-plum mt-4 text-8xl font-bold tracking-wide">{answer}</p>
        {correct && <p className="font-display text-gold mt-10 text-7xl font-bold">+{points}</p>}
      </Screen>
    )
  }

  if (state.phase === 'turnSummary' && state.turnSummary) {
    return (
      <Screen>
        <h1 className="font-display text-6xl font-bold">{state.turnSummary.playerName}</h1>
        <p className="font-display text-plum my-8 text-9xl font-bold tabular-nums">{state.turnSummary.points}</p>
        <div className="w-full max-w-5xl">
          <Leaderboard rows={state.leaderboard} highlightId={state.currentPlayer?.id} big />
        </div>
      </Screen>
    )
  }

  if (state.phase === 'finished') {
    return (
      <main className="flex min-h-screen flex-col justify-center px-10 py-10">
        <h1 className="font-display mb-12 text-center text-6xl font-bold">Clasament final</h1>
        <Podium rows={state.leaderboard} />
      </main>
    )
  }

  return <Screen>…</Screen>
}

/**
 * The player's board as the room sees it: helper letters, whatever the guest
 * has tapped in so far, and the pool still to be used.
 *
 * The mirror is exact — tiles leave the pool here at the same moment they leave
 * it on the tablet — so the room can follow along and work the word out
 * alongside the guest instead of waiting on a finished guess.
 */
function AudienceBoard({ question }: { question: PublicQuestion }) {
  // Helper letters first, so a reported board can never overwrite one.
  const filled: Record<number, string> = { ...question.livePlacement, ...question.revealedSlots }
  const usedIds = new Set(Object.values(filled))
  const pool = question.tiles.filter((t) => !usedIds.has(t.id))
  const words = slotWords(question.slots)

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-12">
      {/* One group per word, matching the player's tablet, so the room is
          looking at the same shape the guest is. */}
      <div className="flex flex-wrap items-center justify-center gap-x-14 gap-y-4">
        {words.map((word) => (
          <div key={word[0].index} className="flex flex-wrap items-center justify-center gap-2">
            {word.map((slot) => {
              const tileId = filled[slot.index]
              const tile = tileId ? question.tiles.find((t) => t.id === tileId) : null
              // Helper letters keep the gold they have always had; letters the
              // guest chose wear the plum of the tablet's own placed tiles, so
              // the room can tell what was given from what was worked out.
              const fromHint = slot.index in question.revealedSlots
              return (
                <div
                  key={slot.index}
                  className={`font-display flex h-24 w-20 items-center justify-center rounded-xl border-4 text-5xl font-bold transition-colors ${
                    fromHint
                      ? 'border-gold bg-gold-light text-ink'
                      : tile
                        ? 'border-plum bg-plum text-cream'
                        : 'border-ink/20 border-dashed bg-white/50'
                  }`}
                >
                  {tile?.char ?? ''}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 opacity-80">
        {pool.map((tile) => (
          <div
            key={tile.id}
            className="font-display flex h-16 w-14 items-center justify-center rounded-lg border-2 border-gold bg-white text-3xl font-bold"
          >
            {tile.char}
          </div>
        ))}
      </div>
    </div>
  )
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-10 py-10 text-center">{children}</main>
  )
}
