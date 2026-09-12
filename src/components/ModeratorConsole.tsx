'use client'

import { CountdownRing } from '@/components/CountdownRing'
import { Button, DifficultyBadge } from '@/components/ui'
import { plural } from '@/lib/plural'
import { slotWords } from '@/lib/tiles'
import { useCountdown } from '@/lib/useSession'
import type { PublicQuestion, PublicState } from '@/lib/types'
import type { useSession } from '@/lib/useSession'

type Actions = ReturnType<typeof useSession>['actions']

/**
 * The host's judging surface, shown while a question is live.
 *
 * At a reception the guest almost always says the word several seconds before
 * they finish tapping it into the tablet, and making the room wait for the
 * tiles is dead time. One press banks the answer at the moment it was spoken.
 *
 * This is the only screen that shows the answer, which is why the console is
 * loud about not projecting it.
 */
export function ModeratorConsole({ state, actions }: { state: PublicState; actions: Actions }) {
  const question = state.question
  const running = state.phase === 'question' && !state.paused
  const remaining = useCountdown(question?.remainingMs ?? null, running)

  if (!question) return null

  const hintsLeft = question.maxHints - question.hintsUsed

  return (
    <section className="border-plum bg-plum/5 rounded-2xl border-2 p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-display text-plum text-2xl font-bold">{state.currentPlayer?.name}</p>
          <p className="text-ink-soft mt-1 flex flex-wrap items-center gap-2 text-sm">
            <span>
              Întrebarea {question.number} / {question.total}
            </span>
            <span>·</span>
            <span>
              {question.categoryIcon} {question.categoryName}
            </span>
            <DifficultyBadge difficulty={question.difficulty} timeoutSec={question.timeoutSec} />
          </p>
        </div>
        <CountdownRing
          remainingMs={remaining}
          totalMs={question.timeoutSec * 1000}
          size={96}
          paused={state.paused}
        />
      </div>

      <p className="selectable text-ink mb-4 text-lg">{question.prompt}</p>

      {/* The answer. The whole point of the console — and the reason it must
          never end up on the projector. */}
      <div className="border-gold bg-gold-light/40 mb-5 rounded-xl border-2 px-4 py-3">
        <p className="text-ink-soft text-xs font-semibold tracking-wide uppercase">
          Răspunsul corect — nu proiecta acest ecran
        </p>
        <p className="font-display text-plum mt-1 text-4xl font-bold tracking-wide">
          {state.hostAnswer ?? '—'}
        </p>
      </div>

      {/* What the guest has tapped in, right under the answer: the host can see
          at a glance how close they are, which is the difference between
          pressing Corect now and giving them another few seconds. */}
      <LiveBoard question={question} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button
          size="xl"
          onClick={() => void actions.judge(true)}
          disabled={state.paused}
          className="bg-easy hover:bg-easy flex-1 text-white hover:opacity-90"
        >
          ✓ Corect — {question.livePoints} puncte
        </Button>
        <Button
          size="lg"
          variant="secondary"
          disabled={hintsLeft <= 0 || !question.hintAvailable || state.paused}
          onClick={() => void actions.hint(question.livePlacement)}
        >
          Literă ajutătoare
          <span className="text-ink-soft ml-2 text-xs font-normal">
            {hintsLeft > 0 && !question.hintAvailable
              ? 'ultima literă e a lui'
              : `−${question.hintCost}p acum · ${plural(hintsLeft, 'rămasă', 'rămase')}`}
          </span>
        </Button>
        <Button size="lg" variant="secondary" disabled={state.paused} onClick={() => void actions.judge(false)}>
          Nu a ghicit
        </Button>
      </div>

      <p className="text-ink-soft text-sm">
        Apasă <strong>Corect</strong> imediat ce invitatul spune cuvântul — punctajul se calculează în acel
        moment, deci nu mai aștepți să termine de atins literele.
        {question.hintsUsed > 0
          ? ` ${plural(question.hintsUsed, 'literă ajutătoare folosită', 'litere ajutătoare folosite')}.`
          : ` Încă fără ajutor — bonusul de +${question.cleanBonus} e în punctajul de mai sus.`}
      </p>
    </section>
  )
}

function LiveBoard({ question }: { question: PublicQuestion }) {
  const filled: Record<number, string> = { ...question.livePlacement, ...question.revealedSlots }
  const words = slotWords(question.slots)
  const placed = Object.keys(filled).length
  const total = question.slots.filter((s) => s.kind === 'letter').length

  return (
    <div className="mb-5">
      <p className="text-ink-soft mb-2 text-xs font-semibold tracking-wide uppercase">
        Ce a pus invitatul · {placed}/{total}
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {words.map((word) => (
          <div key={word[0].index} className="flex flex-wrap items-center gap-1">
            {word.map((slot) => {
              const tileId = filled[slot.index]
              const tile = tileId ? question.tiles.find((t) => t.id === tileId) : null
              const fromHint = slot.index in question.revealedSlots
              return (
                <span
                  key={slot.index}
                  className={`font-display flex h-9 w-7 items-center justify-center rounded-md border-2 text-lg font-bold ${
                    fromHint
                      ? 'border-gold bg-gold-light text-ink'
                      : tile
                        ? 'border-plum bg-plum text-cream'
                        : 'border-ink/20 border-dashed bg-white/60'
                  }`}
                >
                  {tile?.char ?? ''}
                </span>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
