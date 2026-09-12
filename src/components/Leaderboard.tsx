'use client'

import type { LeaderboardRow } from '@/lib/types'
import { plural } from '@/components/ui'

const MEDALS = ['🥇', '🥈', '🥉']

export function Leaderboard({
  rows,
  big = false,
  highlightId,
}: {
  rows: LeaderboardRow[]
  big?: boolean
  highlightId?: string | null
}) {
  if (rows.length === 0) {
    return <p className="text-ink-soft text-center italic">Niciun rezultat încă.</p>
  }

  // Question counts can differ if the host skipped a broken question, so the
  // count is shown whenever it is not uniform — the ranking stays honest.
  const counts = new Set(rows.map((r) => r.questionCount))
  const showCounts = counts.size > 1

  return (
    <ol className={`flex w-full flex-col ${big ? 'gap-3' : 'gap-2'}`}>
      {rows.map((row) => {
        const medal = row.rank <= 3 ? MEDALS[row.rank - 1] : null
        const highlighted = highlightId === row.playerId
        return (
          <li
            key={row.playerId}
            className={`animate-rise flex items-center gap-3 rounded-xl border px-4 ${
              big ? 'py-4' : 'py-3'
            } ${highlighted ? 'border-gold bg-gold-light/40' : 'border-ink/10 bg-white/70'}`}
          >
            <span className={`w-10 shrink-0 text-center font-bold ${big ? 'text-3xl' : 'text-xl'}`}>
              {medal ?? row.rank}
            </span>
            <span className={`font-display flex-1 truncate font-semibold ${big ? 'text-3xl' : 'text-lg'}`}>
              {row.name}
            </span>
            <span className="text-ink-soft hidden text-sm sm:block">
              {showCounts
                ? `${row.correctCount}/${row.questionCount} corecte`
                : plural(row.correctCount, 'corectă', 'corecte')}
              {row.hintsUsed > 0 && ` · ${plural(row.hintsUsed, 'ajutor', 'ajutoare')}`}
            </span>
            <span className={`font-display text-plum font-bold tabular-nums ${big ? 'text-4xl' : 'text-2xl'}`}>
              {row.points}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** Final standings: top three on a podium, the rest listed beneath. */
export function Podium({ rows }: { rows: LeaderboardRow[] }) {
  const top = rows.slice(0, 3)
  const rest = rows.slice(3)
  // Visual order puts second on the left, winner centre, third on the right.
  const arrangement = [top[1], top[0], top[2]].filter(Boolean)
  const heights = ['h-28', 'h-40', 'h-20']
  const heightFor = (row: LeaderboardRow) => heights[row.rank === 1 ? 1 : row.rank === 2 ? 0 : 2]

  return (
    <div className="flex w-full flex-col items-center gap-8">
      <div className="flex w-full items-end justify-center gap-3 sm:gap-6">
        {arrangement.map((row) => (
          <div key={row.playerId} className="animate-rise flex w-1/3 max-w-56 flex-col items-center gap-2">
            <span className="text-4xl sm:text-5xl">{MEDALS[row.rank - 1]}</span>
            <span className="font-display w-full truncate text-center text-xl font-bold sm:text-3xl">{row.name}</span>
            <span className="font-display text-plum text-2xl font-bold tabular-nums sm:text-4xl">{row.points}</span>
            <div
              className={`w-full rounded-t-xl border-2 border-b-0 border-gold bg-gold-light/60 ${heightFor(row)}`}
              aria-hidden
            />
          </div>
        ))}
      </div>
      {rest.length > 0 && <Leaderboard rows={rest} />}
    </div>
  )
}
