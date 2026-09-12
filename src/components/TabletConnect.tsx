'use client'

import { useEffect, useState } from 'react'
import { Button, Card } from '@/components/ui'

interface Candidate {
  label: string
  address: string
  playUrl: string
  displayUrl: string
  likely: boolean
  note?: string
  qr: string | null
}

/**
 * Getting the tablet onto the laptop is the one setup step that reliably goes
 * wrong at a live event, so this shows the candidate addresses with a QR code
 * and says plainly which one to try first.
 */
export function TabletConnect() {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    if (!open || candidates) return
    void fetch('/api/network', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => setCandidates(data.candidates))
      .catch(() => setCandidates([]))
  }, [open, candidates])

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(url)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      // Clipboard is blocked outside a secure context — the URL is on screen
      // anyway, so this is a convenience, not a requirement.
    }
  }

  if (!open) {
    return (
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold">Conectează tableta</h2>
            <p className="text-ink-soft mt-1 text-sm">
              Jucătorul poate juca de pe o tabletă, iar laptopul rămâne pentru tine și pentru clasament.
            </p>
          </div>
          <Button variant="secondary" onClick={() => setOpen(true)}>
            Arată adresa
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold">Conectează tableta</h2>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Ascunde
        </Button>
      </div>

      {candidates === null && <p className="text-ink-soft">Se caută adresele…</p>}
      {candidates?.length === 0 && (
        <p className="text-hard">Nicio adresă de rețea găsită. Conectează laptopul la Wi-Fi.</p>
      )}

      <div className="flex flex-col gap-4">
        {candidates?.map((candidate) => (
          <div
            key={candidate.address}
            className={`flex flex-wrap items-start gap-4 rounded-xl border p-4 ${
              candidate.likely ? 'border-easy/50 bg-easy/5' : 'border-ink/10 bg-ink/5 opacity-70'
            }`}
          >
            {candidate.qr && (
              <div
                // The QR arrives as a fixed-size SVG, so it is pinned to the
                // tile instead of being allowed to render at its own width.
                className="ring-ink/10 h-32 w-32 shrink-0 overflow-hidden rounded-lg bg-white p-2 ring-1 [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
                dangerouslySetInnerHTML={{ __html: candidate.qr }}
              />
            )}
            <div className="flex min-w-56 flex-1 flex-col items-start gap-2">
              <p className="text-ink-soft text-xs font-semibold tracking-wide uppercase">
                {candidate.label}
                {candidate.note && ` — ${candidate.note}`}
              </p>
              <p className="font-display text-lg font-bold break-all">{candidate.playUrl}</p>
              <Button variant="secondary" onClick={() => void copy(candidate.playUrl)}>
                {copied === candidate.playUrl ? 'Copiat!' : 'Copiază'}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <ol className="border-ink/10 text-ink-soft mt-5 flex list-decimal flex-col gap-1.5 border-t pt-4 pl-5 text-sm marker:font-bold">
        <li>Pune tableta pe aceeași rețea Wi-Fi ca laptopul.</li>
        <li>Scanează codul sau tastează adresa în browserul tabletei.</li>
        <li>Dacă nu merge: oprește VPN-ul pe laptop și permite Node.js în Windows Firewall.</li>
      </ol>
    </Card>
  )
}
