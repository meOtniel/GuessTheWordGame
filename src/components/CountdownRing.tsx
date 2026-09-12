'use client'

/**
 * Drains clockwise as the clock runs down, and turns urgent under 25%.
 * The number inside is the plain second count — readable across a room.
 */
export function CountdownRing({
  remainingMs,
  totalMs,
  size = 128,
  paused = false,
}: {
  remainingMs: number
  totalMs: number
  size?: number
  paused?: boolean
}) {
  const fraction = totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 0
  const seconds = Math.ceil(remainingMs / 1000)
  const stroke = size / 12
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius

  const urgent = fraction <= 0.25
  const color = urgent ? 'var(--color-hard)' : fraction <= 0.5 ? 'var(--color-medium)' : 'var(--color-easy)'

  return (
    <div className={`relative ${urgent && !paused ? 'animate-urgent' : ''}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-cream-deep)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          style={{ transition: 'stroke-dashoffset 0.1s linear, stroke 0.3s' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {paused ? (
          <span className="text-ink-soft font-semibold" style={{ fontSize: size / 6 }}>
            PAUZĂ
          </span>
        ) : (
          <span className="font-display font-bold tabular-nums" style={{ fontSize: size / 2.6, color }}>
            {seconds}
          </span>
        )}
      </div>
    </div>
  )
}
