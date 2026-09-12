'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ByDifficulty, PublicState } from './types'

/**
 * Subscribes to the server's session stream.
 *
 * The server owns all state; this hook only mirrors it and posts intents. A
 * polling fallback covers a dropped SSE connection, because a projector that
 * silently freezes mid-reception is worse than a slightly chattier client.
 */
export function useSession(options: { host?: boolean } = {}) {
  const host = options.host === true
  const [state, setState] = useState<PublicState | null>(null)
  const [connected, setConnected] = useState(false)
  /** Local clock offset, so countdowns stay right even if the two clocks differ. */
  const driftRef = useRef(0)
  const receivedAtRef = useRef(Date.now())

  const apply = useCallback((next: PublicState) => {
    driftRef.current = Date.now() - next.serverNow
    receivedAtRef.current = Date.now()
    setState(next)
  }, [])

  useEffect(() => {
    let source: EventSource | null = null
    let pollTimer: ReturnType<typeof setInterval> | null = null
    let cancelled = false

    const startPolling = () => {
      if (pollTimer) return
      pollTimer = setInterval(async () => {
        try {
          const res = await fetch(`/api/session${host ? '?host=1' : ''}`, { cache: 'no-store' })
          const data = await res.json()
          if (!cancelled) apply(data.state)
        } catch {
          // keep trying — the server may simply be restarting
        }
      }, 2000)
    }

    const stopPolling = () => {
      if (pollTimer) clearInterval(pollTimer)
      pollTimer = null
    }

    const connect = () => {
      source = new EventSource(`/api/stream${host ? '?host=1' : ''}`)
      source.onmessage = (event) => {
        if (cancelled) return
        setConnected(true)
        stopPolling()
        apply(JSON.parse(event.data) as PublicState)
      }
      source.onerror = () => {
        setConnected(false)
        startPolling()
      }
    }

    connect()
    return () => {
      cancelled = true
      stopPolling()
      source?.close()
    }
  }, [apply, host])

  /** Server time as of now, corrected for clock skew between the two machines. */
  const serverNow = useCallback(() => Date.now() - driftRef.current, [])

  const post = useCallback(
    async (url: string, body?: unknown) => {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      })
      const data = await res.json()
      if (data.state) apply(data.state)
      return data
    },
    [apply],
  )

  /**
   * Fire-and-forget: the live board is cosmetic, so a dropped report costs the
   * room one stale frame and nothing more. Crucially the reply is discarded
   * rather than applied — letting the server's copy of the board back in would
   * have it fight the player's own taps over a slow link.
   */
  const report = useCallback(async (url: string, body: unknown) => {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true,
      })
    } catch {
      // the next tap reports again
    }
  }, [])

  // Memoised so the object identity is stable across renders. Without this,
  // every SSE push re-ran effects that depend on `actions` — which kept
  // restarting the reveal screen's auto-advance timer and made the reveal
  // linger unpredictably.
  const actions = useMemo(
    () => ({
      startTurn: () => post('/api/turn', { action: 'start' }),
      advance: () => post('/api/turn', { action: 'advance' }),
      submit: (placement: Record<number, string>) => post('/api/answer', { placement }),
      /** Mirror the half-built board to the projector and the moderator. */
      reportPlacement: (placement: Record<number, string>) => void report('/api/placement', { placement }),
      /** Moderator verdict on a spoken answer, scored like a tapped one. */
      judge: (correct: boolean) => post('/api/judge', { correct }),
      /** The board goes with the request so a hint never re-reveals a letter
       *  the player has already placed correctly. */
      hint: (placement: Record<number, string>) => post('/api/hint', { placement }),
      expire: () => post('/api/expire'),
      pause: () => post('/api/admin', { action: 'pause' }),
      resume: () => post('/api/admin', { action: 'resume' }),
      skip: () => post('/api/admin', { action: 'skip' }),
      end: () => post('/api/admin', { action: 'end' }),
      replay: (playerId: string) => post('/api/admin', { action: 'replay', playerId }),
      adjust: (playerId: string, delta: number) => post('/api/admin', { action: 'adjust', playerId, delta }),
      setTimeouts: (timeouts: ByDifficulty<number>) => post('/api/admin', { action: 'timeouts', timeouts }),
    }),
    [post, report],
  )

  return { state, connected, serverNow, actions, refresh: apply }
}

/**
 * Countdown that interpolates locally between server pushes.
 *
 * `remainingMs` is authoritative but only arrives on state changes; ticking
 * locally from the moment it was received keeps the ring smooth without ever
 * letting the client become the source of truth.
 */
export function useCountdown(remainingMs: number | null, running: boolean) {
  const [now, setNow] = useState(() => Date.now())
  const anchorRef = useRef({ at: Date.now(), value: remainingMs ?? 0 })

  useEffect(() => {
    anchorRef.current = { at: Date.now(), value: remainingMs ?? 0 }
    setNow(Date.now())
  }, [remainingMs])

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [running])

  if (remainingMs === null) return 0
  if (!running) return anchorRef.current.value
  return Math.max(0, anchorRef.current.value - (now - anchorRef.current.at))
}
