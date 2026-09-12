'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Leaderboard } from '@/components/Leaderboard'
import { ModeratorConsole } from '@/components/ModeratorConsole'
import { TabletConnect } from '@/components/TabletConnect'
import { Button, Card, DIFFICULTY_LABEL, formatClock, formatDuration } from '@/components/ui'
import { DIFFICULTIES, type ByDifficulty, type PublicState } from '@/lib/types'
import type { useSession } from '@/lib/useSession'

type Actions = ReturnType<typeof useSession>['actions']

const PHASE_LABEL: Record<PublicState['phase'], string> = {
  idle: 'Inactiv',
  lobby: 'Așteaptă jucătorul',
  question: 'Întrebare în curs',
  reveal: 'Se arată răspunsul',
  turnSummary: 'Rezumatul turei',
  finished: 'Sesiune încheiată',
}

export function AdminLive({
  state,
  actions,
  onReset,
}: {
  state: PublicState
  actions: Actions
  onReset: () => void
}) {
  const [timeouts, setTimeouts] = useState<ByDifficulty<number>>(
    state.config?.timeouts ?? { easy: 30, medium: 40, hard: 50 },
  )
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  const pace = state.pace

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-plum text-3xl font-bold">Panoul gazdei</h1>
          <p className="text-ink-soft mt-1">
            {PHASE_LABEL[state.phase]}
            {state.currentPlayer && state.phase !== 'finished' && ` · ${state.currentPlayer.name}`}
            {state.paused && ' · ÎN PAUZĂ'}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/play" target="_blank">
            <Button variant="secondary">Ecran jucător</Button>
          </Link>
          <Link href="/display" target="_blank">
            <Button variant="secondary">Ecran proiector</Button>
          </Link>
        </div>
      </header>

      {state.phase === 'finished' && (
        <Card className="border-gold bg-gold-light/30 border-2">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-display text-plum text-2xl font-bold">Sesiunea s-a încheiat</p>
              <p className="text-ink-soft mt-1 text-sm">
                Clasamentul e salvat și rămâne vizibil pe ecranul invitaților.
              </p>
            </div>
            {/* No confirmation here: the session is already over and the
                leaderboard is persisted, so there is nothing left to lose. */}
            <Button size="xl" onClick={onReset}>
              Sesiune nouă
            </Button>
          </div>
        </Card>
      )}

      {state.phase === 'question' && <ModeratorConsole state={state} actions={actions} />}

      {state.phase === 'lobby' && (
        <Card className="border-plum bg-plum/5 border-2">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-ink-soft text-sm">Urmează</p>
              <p className="font-display text-plum text-3xl font-bold">{state.currentPlayer?.name}</p>
            </div>
            <Button size="xl" onClick={() => void actions.startTurn()}>
              Începe tura
            </Button>
          </div>
        </Card>
      )}

      {/* Pace: the host needs to see trouble at player 3, not player 7. */}
      {pace && state.phase !== 'finished' && (
        <Card className={pace.behindSchedule ? 'border-medium/60 bg-medium/10' : ''}>
          <div className="grid gap-4 sm:grid-cols-4">
            <Stat label="Scurs" value={formatDuration(pace.elapsedMs / 1000)} />
            <Stat label="Jucători terminați" value={`${pace.playersDone} / ${pace.playersTotal}`} />
            <Stat
              label="Medie / jucător"
              value={pace.avgPerPlayerMs ? formatDuration(pace.avgPerPlayerMs / 1000) : '—'}
            />
            <Stat
              label="Final estimat"
              value={formatClock(pace.projectedEndAt)}
              hint={pace.targetEndAt ? `țintă ${formatClock(pace.targetEndAt)}` : undefined}
              warn={pace.behindSchedule}
            />
          </div>
          {pace.behindSchedule && (
            <p className="text-medium mt-3 text-sm font-semibold">
              Ritmul depășește ora țintă. Scurtează timpul pe întrebare mai jos — scorurile rămân comparabile.
            </p>
          )}
        </Card>
      )}

      {/* Live controls */}
      <Card>
        <h2 className="font-display mb-4 text-xl font-bold">Control</h2>
        <div className="flex flex-wrap gap-2">
          {(state.phase === 'reveal' || state.phase === 'turnSummary') && (
            <Button onClick={() => void actions.advance()}>Continuă</Button>
          )}
          {state.phase === 'question' &&
            (state.paused ? (
              <Button onClick={() => void actions.resume()}>Reia cronometrul</Button>
            ) : (
              <Button variant="secondary" onClick={() => void actions.pause()}>
                Pauză
              </Button>
            ))}
          {(state.phase === 'question' || state.phase === 'reveal') && (
            <Button variant="secondary" onClick={() => void actions.skip()}>
              Sari peste întrebare
            </Button>
          )}
          {state.phase !== 'finished' && (
            <Button variant="danger" onClick={() => (confirmEnd ? void actions.end() : setConfirmEnd(true))}>
              {confirmEnd ? 'Sigur? Încheie acum' : 'Încheie sesiunea'}
            </Button>
          )}
          {state.phase !== 'finished' && (
            <Button variant="ghost" onClick={() => (confirmReset ? onReset() : setConfirmReset(true))}>
              {confirmReset ? 'Sigur? Renunță la sesiune' : 'Renunță la sesiune'}
            </Button>
          )}
        </div>
        <p className="text-ink-soft mt-3 text-sm">
          „Sari peste” scoate întrebarea din tura jucătorului fără să îl penalizeze — pentru o întrebare greșită
          sau ambiguă.
        </p>
      </Card>

      {/* Timeouts: the fairest pace lever, since the score is normalised
          against each question's own clock. */}
      <Card>
        <h2 className="font-display mb-4 text-xl font-bold">Timp pe întrebare</h2>
        <div className="flex flex-wrap items-end gap-4">
          {DIFFICULTIES.map((d) => (
            <label key={d} className="flex flex-col gap-1">
              <span className="text-ink-soft text-xs font-semibold uppercase">{DIFFICULTY_LABEL[d]}</span>
              <input
                type="number"
                min={5}
                max={300}
                step={5}
                value={timeouts[d]}
                onChange={(e) => setTimeouts((p) => ({ ...p, [d]: Number(e.target.value) }))}
                className="w-20 rounded-lg border border-ink/15 bg-white px-2 py-1 text-center outline-none focus:border-plum"
              />
            </label>
          ))}
          <Button variant="secondary" onClick={() => void actions.setTimeouts(timeouts)}>
            Aplică
          </Button>
        </div>
        <p className="text-ink-soft mt-3 text-sm">
          Se aplică întrebărilor care nu au început încă. Punctajul se raportează la timpul fiecărei întrebări,
          deci clasamentul rămâne corect.
        </p>
      </Card>

      {/* Players */}
      <Card>
        <h2 className="font-display mb-4 text-xl font-bold">Jucători</h2>
        <ul className="flex flex-col gap-2">
          {state.players.map((player) => (
            <li
              key={player.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-ink/10 bg-white/70 px-3 py-2"
            >
              <span className="font-semibold">{player.name}</span>
              <span className="text-ink-soft text-xs">
                {player.status === 'done' ? 'terminat' : player.status === 'playing' ? 'joacă' : 'așteaptă'} ·{' '}
                {player.answeredCount}/{player.questionCount}
              </span>
              <span className="font-display text-plum ml-auto text-xl font-bold tabular-nums">{player.points}</span>
              <div className="flex gap-1">
                <Button variant="ghost" onClick={() => void actions.adjust(player.id, -10)}>
                  −10
                </Button>
                <Button variant="ghost" onClick={() => void actions.adjust(player.id, 10)}>
                  +10
                </Button>
                <Button variant="ghost" onClick={() => void actions.replay(player.id)}>
                  Reia tura
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <TabletConnect />

      <Card>
        <h2 className="font-display mb-4 text-xl font-bold">Clasament</h2>
        <Leaderboard rows={state.leaderboard} highlightId={state.currentPlayer?.id} />
      </Card>

    </div>
  )
}

function Stat({ label, value, hint, warn }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <div>
      <p className="text-ink-soft text-xs font-semibold tracking-wide uppercase">{label}</p>
      <p className={`font-display text-2xl font-bold ${warn ? 'text-medium' : ''}`}>{value}</p>
      {hint && <p className="text-ink-soft text-xs">{hint}</p>}
    </div>
  )
}
