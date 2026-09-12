'use client'

import type { LeaderboardRow } from '@/lib/types'
import { plural } from '@/lib/plural'

const MEDALS = ['🥇', '🥈', '🥉']

/**
 * Guests type their own names and some are long ("Iubirea vieții mele huge
 * kiss"), so type scales down as the name grows instead of being cut off.
 */
function nameSize(name: string, scale: 'row' | 'row-big' | 'podium') {
  const n = name.trim().length
  if (scale === 'podium') {
    if (n > 34) return 'text-lg sm:text-xl'
    if (n > 22) return 'text-xl sm:text-2xl'
    if (n > 14) return 'text-2xl sm:text-3xl'
    return 'text-2xl sm:text-4xl'
  }
  if (scale === 'row-big') {
    if (n > 34) return 'text-xl'
    if (n > 22) return 'text-2xl'
    return 'text-3xl'
  }
  if (n > 34) return 'text-sm'
  if (n > 22) return 'text-base'
  return 'text-lg'
}

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
        const stats = (
          <>
            {showCounts
              ? `${row.correctCount}/${row.questionCount} corecte`
              : plural(row.correctCount, 'corectă', 'corecte')}
            {row.hintsUsed > 0 && ` · ${plural(row.hintsUsed, 'ajutor', 'ajutoare')}`}
          </>
        )
        return (
          <li
            key={row.playerId}
            className={`animate-rise flex items-center gap-3 rounded-xl border px-4 sm:gap-4 ${
              big ? 'py-4' : 'py-3'
            } ${highlighted ? 'border-gold bg-gold-light/40' : 'border-ink/10 bg-white/70'}`}
          >
            <span
              className={`shrink-0 text-center font-bold ${big ? 'w-12 text-3xl' : 'w-10 text-xl'}`}
            >
              {medal ?? row.rank}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span
                className={`font-display leading-tight font-semibold break-words hyphens-auto ${nameSize(
                  row.name,
                  big ? 'row-big' : 'row',
                )}`}
                lang="ro"
                title={row.name}
              >
                {row.name}
              </span>
              <span className={`text-ink-soft text-xs sm:hidden ${big ? 'text-sm' : ''}`}>{stats}</span>
            </span>
            <span className={`text-ink-soft hidden shrink-0 text-right sm:block ${big ? 'text-base' : 'text-sm'}`}>
              {stats}
            </span>
            <span
              className={`font-display text-plum shrink-0 font-bold tabular-nums ${big ? 'text-4xl' : 'text-2xl'}`}
            >
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
  const heights = ['h-28 sm:h-36', 'h-40 sm:h-52', 'h-20 sm:h-28']
  const heightFor = (row: LeaderboardRow) => heights[row.rank === 1 ? 1 : row.rank === 2 ? 0 : 2]

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-8">
      <div className="grid w-full grid-cols-3 items-end gap-3 sm:gap-6">
        {arrangement.map((row) => (
          <div key={row.playerId} className="animate-rise flex min-w-0 flex-col items-center gap-2">
            <span className="text-4xl sm:text-5xl">{MEDALS[row.rank - 1]}</span>
            <span
              className={`font-display w-full text-center leading-tight font-bold break-words hyphens-auto ${nameSize(
                row.name,
                'podium',
              )}`}
              lang="ro"
              title={row.name}
            >
              {row.name}
            </span>
            <span className="font-display text-plum text-2xl font-bold tabular-nums sm:text-4xl">{row.points}</span>
            <div
              className={`border-gold bg-gold-light/60 w-full rounded-t-xl border-2 border-b-0 ${heightFor(row)}`}
              aria-hidden
            />
          </div>
        ))}
      </div>
      {rest.length > 0 && <Leaderboard rows={rest} />}
    </div>
  )
}
