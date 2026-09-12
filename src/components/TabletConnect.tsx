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
            className={`flex flex-wrap items-center gap-4 rounded-xl border p-3 ${
              candidate.likely ? 'border-easy/50 bg-easy/5' : 'border-ink/10 bg-ink/5 opacity-70'
            }`}
          >
            {candidate.qr && (
              <div
                className="h-28 w-28 shrink-0 rounded-lg bg-white p-1"
                dangerouslySetInnerHTML={{ __html: candidate.qr }}
              />
            )}
            <div className="min-w-52 flex-1">
              <p className="text-ink-soft text-xs font-semibold tracking-wide uppercase">
                {candidate.label}
                {candidate.note && ` — ${candidate.note}`}
              </p>
              <p className="font-display mt-1 text-lg font-bold break-all">{candidate.playUrl}</p>
              <div className="mt-2 flex gap-2">
                <Button variant="secondary" onClick={() => void copy(candidate.playUrl)}>
                  {copied === candidate.playUrl ? 'Copiat!' : 'Copiază'}
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="text-ink-soft mt-4 flex flex-col gap-1 text-sm">
        <p>
          <strong>1.</strong> Pune tableta pe aceeași rețea Wi-Fi ca laptopul.
        </p>
        <p>
          <strong>2.</strong> Scanează codul sau tastează adresa în browserul tabletei.
        </p>
        <p>
          <strong>3.</strong> Dacă nu merge: oprește VPN-ul pe laptop și permite Node.js în Windows Firewall.
        </p>
      </div>
    </Card>
  )
}
