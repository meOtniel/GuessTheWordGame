'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { slotWords } from '@/lib/tiles'
import type { Slot, Tile } from '@/lib/types'

interface Props {
  tiles: Tile[]
  slots: Slot[]
  /** slot index -> tile id, locked in by helper letters and unremovable. */
  revealedSlots: Record<number, string>
  disabled?: boolean
  onSubmit: (placement: Record<number, string>) => void
  /** Bumped by the parent on a wrong answer to shake and clear the board. */
  wrongSignal: number
  /** Mirrors the board to the projector and the moderator as it is built. */
  onPlacementChange?: (placement: Record<number, string>) => void
}

/** Tiles shrink as answers get longer so even a 16-letter word fits one screen.
 *  Both rows use the same size, so the widest case is the slot row plus a full
 *  pool below it — sized here to wrap to two rows at most on a phone. */
function tileSize(letterCount: number): string {
  if (letterCount <= 9) return 'clamp(2.4rem, 9vw, 3.6rem)'
  if (letterCount <= 11) return 'clamp(2.1rem, 8vw, 3.25rem)'
  if (letterCount <= 13) return 'clamp(1.9rem, 6.8vw, 2.9rem)'
  return 'clamp(1.65rem, 5.8vw, 2.5rem)'
}

export function TileBoard({
  tiles,
  slots,
  revealedSlots,
  disabled = false,
  onSubmit,
  wrongSignal,
  onPlacementChange,
}: Props) {
  const [placement, setPlacement] = useState<Record<number, string>>({})
  const [shaking, setShaking] = useState(false)
  const letterSlots = useMemo(() => slots.filter((s) => s.kind === 'letter'), [slots])
  const words = useMemo(() => slotWords(slots), [slots])
  const size = tileSize(letterSlots.length)

  // A new question resets the board entirely.
  const boardKey = useMemo(() => tiles.map((t) => t.id).join('|'), [tiles])
  useEffect(() => {
    setPlacement({})
  }, [boardKey])

  // A helper letter arrives as a new entry in revealedSlots. Lock it in, and
  // bounce whatever tile was sitting there (or that same tile placed
  // elsewhere) back to the pool.
  useEffect(() => {
    setPlacement((current) => {
      const next = { ...current }
      let changed = false
      for (const [slot, tileId] of Object.entries(revealedSlots)) {
        const index = Number(slot)
        if (next[index] === tileId) continue
        for (const [otherSlot, otherTile] of Object.entries(next)) {
          if (otherTile === tileId) delete next[Number(otherSlot)]
        }
        next[index] = tileId
        changed = true
      }
      return changed ? next : current
    })
  }, [revealedSlots])

  useEffect(() => {
    if (wrongSignal === 0) return
    setShaking(true)
    // Keep the revealed letters; clear only what the player chose.
    setPlacement({ ...revealedSlots })
    const id = setTimeout(() => setShaking(false), 450)
    return () => clearTimeout(id)
    // Intentionally keyed on the signal alone — revealedSlots changing must not
    // re-trigger a shake.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wrongSignal])

  // Report the board upward on every change, coalesced so a guest drumming on
  // the tiles sends one update rather than one per finger. The tablet stays
  // authoritative throughout — this only ever tells, never asks.
  const reportRef = useRef(onPlacementChange)
  reportRef.current = onPlacementChange
  useEffect(() => {
    const id = setTimeout(() => reportRef.current?.(placement), 80)
    return () => clearTimeout(id)
  }, [placement])

  const placedIds = useMemo(() => new Set(Object.values(placement)), [placement])
  const pool = useMemo(() => tiles.filter((t) => !placedIds.has(t.id)), [tiles, placedIds])

  const submittedFor = useRef<string>('')

  const placeTile = useCallback(
    (tileId: string) => {
      if (disabled) return
      setPlacement((current) => {
        const target = letterSlots.find((slot) => !(slot.index in current))
        if (!target) return current
        return { ...current, [target.index]: tileId }
      })
    },
    [disabled, letterSlots],
  )

  const removeTile = useCallback(
    (slotIndex: number) => {
      if (disabled || slotIndex in revealedSlots) return
      setPlacement((current) => {
        const next = { ...current }
        delete next[slotIndex]
        return next
      })
    },
    [disabled, revealedSlots],
  )

  // Auto-submit the moment the last slot is filled: asking a guest to also
  // find a "check" button adds a step to every single answer.
  useEffect(() => {
    if (disabled) return
    const complete = letterSlots.every((slot) => slot.index in placement)
    if (!complete) return
    const signature = letterSlots.map((s) => placement[s.index]).join('|')
    if (submittedFor.current === signature) return
    submittedFor.current = signature
    onSubmit(placement)
  }, [placement, letterSlots, disabled, onSubmit])

  return (
    <div className="flex w-full flex-col items-center gap-8">
      {/* Answer slots, one group per word: a word never breaks across lines, so
          the player can read off how many words there are and how long each is. */}
      <div
        className={`flex flex-wrap items-center justify-center ${shaking ? 'animate-shake' : ''}`}
        style={{
          ['--tile' as string]: size,
          columnGap: 'calc(var(--tile) * 0.7)',
          rowGap: 'calc(var(--tile) * 0.35)',
        }}
      >
        {words.map((word, wordIndex) => (
          <div
            key={word[0].index}
            role={words.length > 1 ? 'group' : undefined}
            aria-label={words.length > 1 ? `Cuvântul ${wordIndex + 1} din ${words.length}` : undefined}
            className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2"
          >
            {word.map((slot) => {
              const tileId = placement[slot.index]
              const tile = tileId ? tiles.find((t) => t.id === tileId) : null
              const locked = slot.index in revealedSlots

              return (
                <button
                  key={slot.index}
                  type="button"
                  onClick={() => removeTile(slot.index)}
                  disabled={disabled || !tile || locked}
                  aria-label={tile ? `Litera ${tile.char}` : 'Loc liber'}
                  className={`font-display flex items-center justify-center rounded-xl border-2 font-bold transition-all ${
                    locked
                      ? 'border-gold bg-gold-light text-ink'
                      : tile
                        ? 'border-plum bg-plum text-cream cursor-pointer'
                        : 'border-ink/20 border-dashed bg-white/50'
                  }`}
                  style={{
                    width: 'var(--tile)',
                    height: 'calc(var(--tile) * 1.15)',
                    fontSize: 'calc(var(--tile) * 0.52)',
                  }}
                >
                  {tile?.char ?? ''}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {/* Scrambled pool */}
      <div
        className="flex min-h-20 flex-wrap items-center justify-center gap-1.5 sm:gap-2"
        style={{ ['--tile' as string]: size }}
      >
        {pool.map((tile) => (
          <button
            key={tile.id}
            type="button"
            onClick={() => placeTile(tile.id)}
            disabled={disabled}
            aria-label={`Alege litera ${tile.char}`}
            className="font-display animate-pop flex items-center justify-center rounded-xl border-2 border-gold bg-white font-bold text-ink shadow-sm transition-transform hover:-translate-y-1 active:translate-y-0 disabled:opacity-40"
            style={{ width: 'var(--tile)', height: 'calc(var(--tile) * 1.15)', fontSize: 'calc(var(--tile) * 0.52)' }}
          >
            {tile.char}
          </button>
        ))}
      </div>
    </div>
  )
}
