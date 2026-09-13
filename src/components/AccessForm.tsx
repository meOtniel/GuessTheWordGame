'use client'

import { useState } from 'react'
import { Button, Card } from '@/components/ui'

/**
 * The code-entry screen.
 *
 * Submitting navigates to the destination with the code attached, and the
 * middleware swaps it for a cookie and strips it from the URL. That is the
 * same path the QR code takes, so there is only one way in to get right.
 */
export function AccessForm({ next, failed }: { next: string; failed: boolean }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = code.trim()
    if (trimmed.length === 0) return
    setBusy(true)
    // A full navigation rather than a client-side route change: the gate lives
    // in middleware, and this guarantees the request actually reaches it.
    window.location.replace(`${next}?k=${encodeURIComponent(trimmed)}`)
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-6 px-6 py-12">
      <div className="text-center">
        <h1 className="font-display text-plum text-4xl font-bold">Ghicește Cuvântul</h1>
        <p className="text-ink-soft mt-2">Introdu codul de acces ca să intri în joc.</p>
      </div>

      <Card className="w-full">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <input
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            // The codes are letters and digits only, so a plain text field with
            // autocorrect off beats a numeric keypad on a tablet.
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={12}
            aria-label="Cod de acces"
            placeholder="ABC234"
            className="border-ink/15 focus:border-plum font-display w-full rounded-xl border bg-white px-4 py-4 text-center text-3xl font-bold tracking-[0.3em] uppercase outline-none"
          />
          {failed && <p className="text-hard text-center text-sm font-semibold">Cod greșit. Mai încearcă o dată.</p>}
          <Button type="submit" size="lg" disabled={busy || code.trim().length === 0}>
            {busy ? 'Se verifică…' : 'Intră'}
          </Button>
        </form>
      </Card>

      <p className="text-ink-soft text-center text-sm">
        Codul e afișat pe laptopul gazdei. Scanează codul QR și intri direct, fără să-l tastezi.
      </p>
    </main>
  )
}
