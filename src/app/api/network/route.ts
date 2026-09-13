import { networkInterfaces } from 'node:os'
import { NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { accessCodes } from '@/server/access'

export const dynamic = 'force-dynamic'

/**
 * Addresses the player tablet can use to reach this laptop.
 *
 * Getting a second device connected is the one setup step that reliably goes
 * wrong at a live event, so the console shows the candidate URLs with a QR
 * code rather than leaving the host to guess an IP.
 *
 * Interfaces are ranked, because a machine usually offers several and only one
 * of them works: a VPN or a Hyper-V switch will happily advertise an address
 * the tablet can never reach.
 */
interface Candidate {
  label: string
  address: string
  playUrl: string
  displayUrl: string
  likely: boolean
  note?: string
}

const UNLIKELY = [
  { match: /vpn|proton|nord|express|wireguard|tailscale|zerotier/i, note: 'VPN — de obicei nu e accesibil de pe tabletă' },
  { match: /vethernet|hyper-v|docker|wsl|virtualbox|vmware|default switch/i, note: 'adaptor virtual — nu e rețeaua ta' },
]

function classify(name: string): { likely: boolean; note?: string } {
  for (const rule of UNLIKELY) {
    if (rule.match.test(name)) return { likely: false, note: rule.note }
  }
  if (/wi-?fi|wlan|wireless/i.test(name)) return { likely: true, note: 'Wi-Fi — cel mai probabil corect' }
  if (/ethernet|eth/i.test(name)) return { likely: true, note: 'cablu de rețea' }
  return { likely: true }
}

export async function GET(request: Request) {
  const port = new URL(request.url).port || '3000'
  const { guest } = accessCodes()
  const candidates: Candidate[] = []

  for (const [name, addresses] of Object.entries(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family !== 'IPv4' || address.internal) continue
      const { likely, note } = classify(name)
      const base = `http://${address.address}:${port}`
      candidates.push({
        label: name,
        address: address.address,
        // The guest code rides along in the link, so scanning the QR gets the
        // tablet all the way into the game rather than onto a code prompt.
        playUrl: `${base}/play?k=${guest}`,
        displayUrl: `${base}/display?k=${guest}`,
        likely,
        note,
      })
    }
  }

  // Most promising first, so the host tries the right one straight away.
  candidates.sort((a, b) => Number(b.likely) - Number(a.likely))

  const qr = await Promise.all(
    candidates.map((candidate) =>
      QRCode.toString(candidate.playUrl, {
        type: 'svg',
        margin: 1,
        width: 180,
        color: { dark: '#2a1b2d', light: '#ffffff' },
      }).catch(() => null),
    ),
  )

  // Only the moderator console can reach this route, so it is also the right
  // place to tell the host the code to read out to anyone typing it by hand.
  return NextResponse.json({
    port,
    guestCode: guest,
    candidates: candidates.map((candidate, i) => ({ ...candidate, qr: qr[i] })),
  })
}
