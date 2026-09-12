'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button, Card, formatDuration, plural } from '@/components/ui'
import { DIFFICULTIES, type ByDifficulty, type Difficulty, type PublicState, type Theme } from '@/lib/types'

interface CategorySummary {
  id: string
  name: string
  theme: Theme
  icon: string
  total: number
  counts: ByDifficulty<number>
}

interface Feasibility {
  ok: boolean
  errors: string[]
  warnings: string[]
  questionsUsed: number
  questionsAvailable: number
  estimate: {
    questionsPerPlayer: number
    totalSec: { realistic: number; pessimistic: number; worst: number }
  }
}

const DIFF_LABEL: Record<Difficulty, string> = { easy: 'Ușoare', medium: 'Medii', hard: 'Grele' }

export function AdminSetup({ onCreated }: { onCreated: (state: PublicState) => void }) {
  const [categories, setCategories] = useState<CategorySummary[]>([])
  const [issues, setIssues] = useState<{ file: string; message: string }[]>([])
  const [names, setNames] = useState<string[]>(() => Array(8).fill(''))
  const [selected, setSelected] = useState<string[]>([])
  const [profile, setProfile] = useState<ByDifficulty<number>>({ easy: 3, medium: 2, hard: 1 })
  const [timeouts, setTimeouts] = useState<ByDifficulty<number>>({ easy: 30, medium: 40, hard: 50 })
  const [themedPerPlayer, setThemedPerPlayer] = useState(2)
  const [targetEnd, setTargetEnd] = useState('')
  const [feasibility, setFeasibility] = useState<Feasibility | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void fetch('/api/categories', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        setCategories(data.categories)
        setIssues(data.issues ?? [])
        setSelected(data.categories.map((c: CategorySummary) => c.id))
      })
  }, [])

  const filledNames = useMemo(() => names.map((n) => n.trim()).filter(Boolean), [names])
  const questionsPerPlayer = DIFFICULTIES.reduce((s, d) => s + profile[d], 0)

  // Live capacity + pacing readout, debounced so typing a name doesn't spam.
  useEffect(() => {
    if (filledNames.length === 0 || selected.length === 0) {
      setFeasibility(null)
      return
    }
    const id = setTimeout(() => {
      void fetch('/api/feasibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerCount: filledNames.length,
          categoryIds: selected,
          profile,
          timeouts,
          themedPerPlayer,
        }),
      })
        .then((r) => r.json())
        .then(setFeasibility)
        .catch(() => setFeasibility(null))
    }, 300)
    return () => clearTimeout(id)
  }, [filledNames.length, selected, profile, timeouts, themedPerPlayer])

  const duplicateNames = filledNames.length !== new Set(filledNames).size
  const canStart = feasibility?.ok === true && filledNames.length > 0 && !duplicateNames && !submitting

  async function start() {
    setSubmitting(true)
    setError(null)

    let targetEndAt: number | null = null
    if (targetEnd) {
      const [h, m] = targetEnd.split(':').map(Number)
      const date = new Date()
      date.setHours(h, m, 0, 0)
      // A target before now means the host meant tonight, past midnight.
      if (date.getTime() < Date.now()) date.setDate(date.getDate() + 1)
      targetEndAt = date.getTime()
    }

    const res = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerNames: filledNames,
        categoryIds: selected,
        profile,
        timeouts,
        themedPerPlayer,
        targetEndAt,
      }),
    })
    const data = await res.json()
    setSubmitting(false)
    if (!res.ok) {
      setError(data.error ?? 'Nu am putut porni sesiunea.')
      return
    }
    onCreated(data.state)
  }

  const themed = categories.filter((c) => c.theme === 'christian')
  const general = categories.filter((c) => c.theme === 'general')

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <header>
        <h1 className="font-display text-plum text-4xl font-bold">Sesiune nouă</h1>
        <p className="text-ink-soft mt-1">Pregătește jocul, apoi dă tableta primului invitat.</p>
      </header>

      {issues.length > 0 && (
        <Card className="border-hard/40 bg-hard/5">
          <p className="text-hard font-semibold">Probleme în seturile de întrebări</p>
          <ul className="text-ink-soft mt-2 list-disc pl-5 text-sm">
            {issues.map((issue, i) => (
              <li key={i}>
                <code>{issue.file}</code>: {issue.message}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <SectionTitle>Jucători</SectionTitle>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {names.map((name, i) => (
            <input
              key={i}
              value={name}
              onChange={(e) => setNames((prev) => prev.map((n, j) => (j === i ? e.target.value : n)))}
              placeholder={`Jucător ${i + 1}`}
              maxLength={40}
              className="rounded-lg border border-ink/15 bg-white px-3 py-2 outline-none focus:border-plum"
            />
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button variant="secondary" onClick={() => setNames((p) => [...p, ''])}>
            + Adaugă jucător
          </Button>
          {names.length > 1 && (
            <Button variant="ghost" onClick={() => setNames((p) => p.slice(0, -1))}>
              Șterge ultimul
            </Button>
          )}
          <span className="text-ink-soft text-sm">{plural(filledNames.length, 'completat', 'completați')}</span>
          {duplicateNames && <span className="text-hard text-sm font-semibold">Numele trebuie să fie diferite.</span>}
        </div>
      </Card>

      <Card>
        <SectionTitle>Întrebări per jucător</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-3">
          {DIFFICULTIES.map((d) => (
            <div key={d} className="flex flex-col gap-2">
              <label className="text-ink-soft text-sm font-semibold">{DIFF_LABEL[d]}</label>
              <div className="flex items-center gap-2">
                <NumberInput
                  value={profile[d]}
                  min={0}
                  max={20}
                  onChange={(v) => setProfile((p) => ({ ...p, [d]: v }))}
                />
                <span className="text-ink-soft text-sm">×</span>
                <NumberInput
                  value={timeouts[d]}
                  min={5}
                  max={300}
                  step={5}
                  onChange={(v) => setTimeouts((p) => ({ ...p, [d]: v }))}
                />
                <span className="text-ink-soft text-sm">sec</span>
              </div>
            </div>
          ))}
        </div>
        <p className="text-ink-soft mt-3 text-sm">
          {plural(questionsPerPlayer, 'întrebare', 'întrebări')} per jucător · din care{' '}
          <NumberInput value={themedPerPlayer} min={0} max={questionsPerPlayer} onChange={setThemedPerPlayer} inline />{' '}
          tematice (biblice / nuntă)
        </p>
      </Card>

      <Card>
        <SectionTitle>Categorii</SectionTitle>
        <CategoryGroup label="Tematice" items={themed} selected={selected} onToggle={setSelected} />
        <CategoryGroup label="Generale" items={general} selected={selected} onToggle={setSelected} />
        <div className="mt-4 flex gap-2">
          <Button variant="ghost" onClick={() => setSelected(categories.map((c) => c.id))}>
            Selectează tot
          </Button>
          <Button variant="ghost" onClick={() => setSelected([])}>
            Deselectează tot
          </Button>
        </div>
      </Card>

      <Card>
        <SectionTitle>Ora la care trebuie să se termine (opțional)</SectionTitle>
        <input
          type="time"
          value={targetEnd}
          onChange={(e) => setTargetEnd(e.target.value)}
          className="rounded-lg border border-ink/15 bg-white px-3 py-2 outline-none focus:border-plum"
        />
        <p className="text-ink-soft mt-2 text-sm">
          Panoul din timpul jocului te avertizează dacă ritmul depășește această oră.
        </p>
      </Card>

      {feasibility && (
        <Card className={feasibility.ok ? 'border-easy/40 bg-easy/5' : 'border-hard/40 bg-hard/5'}>
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <p className="font-semibold">
              {plural(filledNames.length, 'jucător', 'jucători')} ×{' '}
              {plural(questionsPerPlayer, 'întrebare', 'întrebări')}
            </p>
            <p className="text-ink-soft text-sm">
              Folosite {feasibility.questionsUsed} din{' '}
              {plural(feasibility.questionsAvailable, 'întrebare', 'întrebări')}
            </p>
          </div>

          {feasibility.ok && (
            <p className="font-display mt-3 text-2xl">
              Durată estimată: <strong>{formatDuration(feasibility.estimate.totalSec.realistic)}</strong>
              <span className="text-ink-soft ml-2 text-base">
                (pesimist {formatDuration(feasibility.estimate.totalSec.pessimistic)} · maxim{' '}
                {formatDuration(feasibility.estimate.totalSec.worst)})
              </span>
            </p>
          )}

          {feasibility.errors.map((e, i) => (
            <p key={i} className="text-hard mt-2 font-semibold">
              {e}
            </p>
          ))}
          {feasibility.warnings.map((w, i) => (
            <p key={i} className="text-medium mt-2 text-sm">
              Atenție: {w}
            </p>
          ))}
        </Card>
      )}

      {error && <p className="text-hard font-semibold">{error}</p>}

      <Button size="xl" disabled={!canStart} onClick={() => void start()}>
        {submitting ? 'Se pregătește…' : 'Începe sesiunea'}
      </Button>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="font-display mb-4 text-xl font-bold">{children}</h2>
}

function NumberInput({
  value,
  min,
  max,
  step = 1,
  onChange,
  inline = false,
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  inline?: boolean
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const next = Number(e.target.value)
        if (Number.isFinite(next)) onChange(Math.max(min, Math.min(max, next)))
      }}
      className={`rounded-lg border border-ink/15 bg-white px-2 py-1 text-center outline-none focus:border-plum ${
        inline ? 'w-14' : 'w-16'
      }`}
    />
  )
}

function CategoryGroup({
  label,
  items,
  selected,
  onToggle,
}: {
  label: string
  items: CategorySummary[]
  selected: string[]
  onToggle: (next: string[]) => void
}) {
  if (items.length === 0) return null
  return (
    <div className="mb-4">
      <p className="text-ink-soft mb-2 text-xs font-semibold tracking-wide uppercase">{label}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((category) => {
          const on = selected.includes(category.id)
          return (
            <button
              key={category.id}
              type="button"
              onClick={() =>
                onToggle(on ? selected.filter((id) => id !== category.id) : [...selected, category.id])
              }
              className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${
                on ? 'border-plum bg-plum/10' : 'border-ink/15 bg-white hover:bg-cream-deep'
              }`}
            >
              <span className="text-xl">{category.icon}</span>
              <span className="flex-1 font-semibold">{category.name}</span>
              <span className="text-ink-soft text-xs tabular-nums">
                {category.counts.easy}/{category.counts.medium}/{category.counts.hard}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
