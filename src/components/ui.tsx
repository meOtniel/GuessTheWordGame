'use client'

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { Difficulty } from '@/lib/types'

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'Ușoară',
  medium: 'Medie',
  hard: 'Grea',
}

export const DIFFICULTY_CLASS: Record<Difficulty, string> = {
  easy: 'bg-easy',
  medium: 'bg-medium',
  hard: 'bg-hard',
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'md' | 'lg' | 'xl'
}

const VARIANTS = {
  primary: 'bg-plum text-cream hover:bg-plum-light active:bg-plum disabled:bg-ink-soft',
  secondary: 'bg-cream-deep text-ink hover:bg-gold-light border border-ink/15',
  ghost: 'bg-transparent text-ink-soft hover:text-ink hover:bg-cream-deep',
  danger: 'bg-hard text-white hover:opacity-90',
}

const SIZES = {
  md: 'px-4 py-2 text-sm rounded-lg',
  // 64px minimum tap target — the play screen is used by guests of every age.
  lg: 'px-6 py-4 text-lg rounded-xl min-h-16',
  xl: 'px-10 py-6 text-2xl rounded-2xl min-h-20',
}

export function Button({ variant = 'primary', size = 'md', className = '', ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={`font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    />
  )
}

export function DifficultyBadge({ difficulty, timeoutSec }: { difficulty: Difficulty; timeoutSec?: number }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold tracking-wide text-white uppercase ${DIFFICULTY_CLASS[difficulty]}`}
    >
      {DIFFICULTY_LABEL[difficulty]}
      {timeoutSec !== undefined && <span className="opacity-80">{timeoutSec}s</span>}
    </span>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-ink/10 bg-white/70 p-5 shadow-sm ${className}`}>{children}</div>
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  return `${m} min`
}

/**
 * Romanian numeral agreement: 1 takes the singular, 2-19 the plural, and from
 * 20 up the plural needs "de" in front of it ("20 de ajutoare").
 */
export function plural(count: number, one: string, few: string): string {
  if (count === 1) return `${count} ${one}`
  if (count < 20) return `${count} ${few}`
  return `${count} de ${few}`
}

export function formatClock(epochMs: number | null): string {
  if (epochMs === null) return '--:--'
  return new Date(epochMs).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })
}
