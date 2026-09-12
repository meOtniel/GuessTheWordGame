'use client'

import { useEffect } from 'react'

/** Fires once per correct answer. Loaded lazily so it costs nothing otherwise. */
export function useConfetti(trigger: boolean) {
  useEffect(() => {
    if (!trigger) return
    let cancelled = false

    void import('canvas-confetti').then(({ default: confetti }) => {
      if (cancelled) return
      const shoot = (particleRatio: number, opts: Record<string, unknown>) =>
        confetti({
          origin: { y: 0.62 },
          colors: ['#c9a227', '#e8cf7a', '#c86b85', '#4a2545', '#fbf7f0'],
          particleCount: Math.floor(200 * particleRatio),
          ...opts,
        })

      shoot(0.25, { spread: 26, startVelocity: 55 })
      shoot(0.2, { spread: 60 })
      shoot(0.35, { spread: 100, decay: 0.91, scalar: 0.8 })
      shoot(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 })
      shoot(0.1, { spread: 120, startVelocity: 45 })
    })

    return () => {
      cancelled = true
    }
  }, [trigger])
}
