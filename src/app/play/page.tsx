'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { CountdownRing } from '@/components/CountdownRing'
import { useConfetti } from '@/components/Confetti'
import { Leaderboard, Podium } from '@/components/Leaderboard'
import { TileBoard } from '@/components/TileBoard'
import { Button, DifficultyBadge } from '@/components/ui'
import { plural } from '@/lib/plural'
import { useCountdown, useSession } from '@/lib/useSession'

export default function PlayPage() {
  const { state, actions } = useSession()
  const [wrongSignal, setWrongSignal] = useState(0)
  const [busy, setBusy] = useState(false)

  const question = state?.question ?? null
  const running = state?.phase === 'question' && !state.paused
  const remaining = useCountdown(question?.remainingMs ?? null, running)

  // Report the clock running out. The server re-checks its own clock before
  // acting, so a lagging or lying client cannot end a question early.
  const expiredFor = useRef<string>('')
  useEffect(() => {
    if (!question || !running || remaining > 0) return
    const key = `${state?.currentPlayer?.id}:${question.number}`
    if (expiredFor.current === key) return
    expiredFor.current = key
    void actions.expire()
  }, [remaining, running, question, actions, state?.currentPlayer?.id])

  // The tablet's own board, kept here as well as on the server: a helper letter
  // is chosen against it, so it must be the board as it stands right now rather
  // than whatever the last mirror report happened to carry.
  const placementRef = useRef<Record<number, string>>({})
  const handlePlacementChange = useCallback(
    (placement: Record<number, string>) => {
      placementRef.current = placement
      actions.reportPlacement(placement)
    },
    [actions],
  )

  const handleSubmit = useCallback(
    async (placement: Record<number, string>) => {
      setBusy(true)
      const result = await actions.submit(placement)
      setBusy(false)
      if (!result.correct) setWrongSignal((n) => n + 1)
    },
    [actions],
  )

  // Reveal lingers, then moves on by itself so nobody has to nurse the screen.
  useEffect(() => {
    if (state?.phase !== 'reveal') return
    const delay = state.config?.revealMs ?? 3000
    const id = setTimeout(() => void actions.advance(), delay)
    return () => clearTimeout(id)
  }, [state?.phase, state?.config?.revealMs, actions])

  useConfetti(state?.phase === 'reveal' && state.reveal?.correct === true)

  if (!state) {
    return <Centered>Se încarcă…</Centered>
  }

  if (state.phase === 'idle') {
    return (
      <Centered>
        <p className="text-ink-soft mb-6 text-xl">Nicio sesiune activă.</p>
        <Link href="/admin">
          <Button size="lg">Deschide panoul gazdei</Button>
        </Link>
      </Centered>
    )
  }

  if (state.phase === 'lobby') {
    const next = state.currentPlayer
    return (
      <Centered>
        <p className="text-ink-soft text-2xl">Urmează</p>
        <h1 className="font-display text-plum my-6 text-6xl font-bold sm:text-8xl">{next?.name}</h1>
        <p className="text-ink-soft mb-10 text-lg">
          {plural(next?.questionCount ?? 0, 'întrebare', 'întrebări')} · dă tableta jucătorului
        </p>
        <Button size="xl" onClick={() => void actions.startTurn()}>
          Începe
        </Button>
      </Centered>
    )
  }

  if (state.phase === 'question' && question) {
    const hintsLeft = question.maxHints - question.hintsUsed
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-6">
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-ink-soft text-sm font-semibold">
              {state.currentPlayer?.name} · întrebarea {question.number} din {question.total}
            </p>
            <p className="mt-1 flex items-center gap-2 text-sm">
              <span>{question.categoryIcon}</span>
              <span className="text-ink-soft">{question.categoryName}</span>
              <DifficultyBadge difficulty={question.difficulty} timeoutSec={question.timeoutSec} />
            </p>
          </div>
          <CountdownRing remainingMs={remaining} totalMs={question.timeoutSec * 1000} size={92} paused={state.paused} />
        </header>

        {/* A paused game covers the prompt: after a restart or a deliberate
            pause, the question must not sit exposed while the room waits. */}
        {state.paused && (
          <div className="bg-cream/95 fixed inset-0 z-10 flex flex-col items-center justify-center gap-8 px-6 text-center">
            <p className="font-display text-plum text-5xl font-bold">Joc în pauză</p>
            <p className="text-ink-soft text-xl">
              Cronometrul este oprit. Urmează {state.currentPlayer?.name} — dă-i dispozitivul și continuă.
            </p>
            <Button size="xl" onClick={() => void actions.resume()}>
              Continuă
            </Button>
          </div>
        )}

        <p className="font-display selectable my-6 text-center text-2xl leading-snug sm:text-4xl">{question.prompt}</p>

        <div className="flex flex-1 flex-col justify-center">
          <TileBoard
            tiles={question.tiles}
            slots={question.slots}
            revealedSlots={question.revealedSlots}
            disabled={busy || state.paused}
            onSubmit={handleSubmit}
            wrongSignal={wrongSignal}
            onPlacementChange={handlePlacementChange}
          />
        </div>

        <footer className="mt-8 flex items-center justify-between gap-4">
          <Button
            variant="secondary"
            size="lg"
            disabled={hintsLeft <= 0 || !question.hintAvailable || state.paused}
            onClick={() => void actions.hint(placementRef.current)}
          >
            Literă ajutătoare
            <span className="text-ink-soft ml-2 text-sm font-normal">
              {hintsLeft > 0 && !question.hintAvailable
                ? 'ultima literă e a ta'
                : `−${question.hintCost}p acum · ${plural(hintsLeft, 'rămasă', 'rămase')}`}
            </span>
          </Button>
          <div className="text-right">
            <p className="text-ink-soft text-xs tracking-wide uppercase">Valorează acum</p>
            <p className="font-display text-plum text-4xl font-bold tabular-nums">{question.livePoints}</p>
            {/* Says out loud what the first helper letter would hand back, so the
                button's price is never a surprise. */}
            {question.cleanBonus > 0 && (
              <p className="text-gold text-xs font-semibold">include +{question.cleanBonus} fără ajutor</p>
            )}
          </div>
        </footer>
      </main>
    )
  }

  if (state.phase === 'reveal' && state.reveal) {
    const { correct, answer, points } = state.reveal
    return (
      <Centered>
        <p className={`font-display text-5xl font-bold sm:text-7xl ${correct ? 'text-easy' : 'text-hard'}`}>
          {correct ? `Bravo, ${state.currentPlayer?.name}!` : 'Timpul a expirat'}
        </p>
        <p className="text-ink-soft mt-8 text-xl">Răspunsul era</p>
        <p className="font-display text-plum mt-2 text-4xl font-bold tracking-wide sm:text-6xl">{answer}</p>
        {correct && <p className="font-display text-gold mt-8 text-5xl font-bold">+{points}</p>}
      </Centered>
    )
  }

  if (state.phase === 'turnSummary' && state.turnSummary) {
    const summary = state.turnSummary
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-4 py-10">
        <h1 className="font-display text-center text-4xl font-bold sm:text-5xl">{summary.playerName}</h1>
        <p className="font-display text-plum my-6 text-center text-7xl font-bold tabular-nums">{summary.points}</p>
        <p className="text-ink-soft mb-8 text-center">din {summary.maxPoints} posibile</p>

        <ul className="mb-10 flex flex-col gap-2">
          {summary.rows.map((row, i) => (
            <li key={i} className="flex items-center gap-3 rounded-xl border border-ink/10 bg-white/70 px-4 py-3">
              <span className={`text-xl ${row.correct ? 'text-easy' : 'text-hard'}`}>{row.correct ? '✓' : '✗'}</span>
              <span className="font-display flex-1 truncate font-semibold">{row.answer}</span>
              {row.hintsUsed > 0 && (
                <span className="text-ink-soft text-xs">{plural(row.hintsUsed, 'ajutor', 'ajutoare')}</span>
              )}
              <span className="font-display text-plum font-bold tabular-nums">{row.points}</span>
            </li>
          ))}
        </ul>

        <Button size="xl" onClick={() => void actions.advance()}>
          Următorul jucător
        </Button>
      </main>
    )
  }

  if (state.phase === 'finished') {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-4 py-10">
        <h1 className="font-display mb-10 text-center text-4xl font-bold sm:text-5xl">Clasament final</h1>
        <Podium rows={state.leaderboard} />
        <div className="mt-10 flex justify-center">
          <Link href="/admin">
            <Button variant="secondary" size="lg">
              Panoul gazdei
            </Button>
          </Link>
        </div>
      </main>
    )
  }

  return (
    <Centered>
      <Leaderboard rows={state.leaderboard} />
    </Centered>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">{children}</main>
  )
}
