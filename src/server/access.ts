import { randomInt } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const ACCESS_FILE = path.join(process.cwd(), 'data', 'access.json')

/**
 * No O/0 and no I/1: the codes are read off a screen and typed on a tablet,
 * often by someone who has had a glass of wine.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const LENGTH = 6

export type Role = 'guest' | 'host'

export interface AccessCodes {
  /** Lets a device play and watch. Printed on the console for the tablet. */
  guest: string
  /** Also opens the moderator console, which shows the answers. */
  host: string
}

let cached: AccessCodes | null = null

function mint(): string {
  let code = ''
  for (let i = 0; i < LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)]
  return code
}

function isCode(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/**
 * The two access codes, generated on first boot and kept in data/access.json.
 *
 * Generating them beats asking for configuration: there is nothing to edit
 * before the first run, and no chance of the game going to a reception with
 * whatever placeholder password the repository shipped with. To change them,
 * delete the file and restart.
 */
export function accessCodes(): AccessCodes {
  if (cached) return cached

  try {
    const parsed = JSON.parse(readFileSync(ACCESS_FILE, 'utf8')) as Partial<AccessCodes>
    if (isCode(parsed.guest) && isCode(parsed.host) && parsed.guest !== parsed.host) {
      cached = { guest: parsed.guest, host: parsed.host }
      announce(cached)
      return cached
    }
  } catch {
    // No file yet, or an unreadable one — mint a fresh pair below.
  }

  let guest = mint()
  let host = mint()
  while (host === guest) host = mint()
  cached = { guest, host }

  try {
    mkdirSync(path.dirname(ACCESS_FILE), { recursive: true })
    writeFileSync(ACCESS_FILE, JSON.stringify(cached, null, 2), 'utf8')
  } catch (err) {
    // The codes still work for as long as this process lives; they would just
    // change on restart. Losing the game to a disk error would be worse.
    console.error('[access] nu am putut salva codurile:', err)
  }

  announce(cached)
  return cached
}

let announced = false

/** Printed once per boot, because the terminal is where the host will look. */
function announce(codes: AccessCodes): void {
  if (announced) return
  announced = true
  console.log(
    `\n  Coduri de acces\n` +
      `    invitați (tabletă, proiector): ${codes.guest}\n` +
      `    gazdă (consola, arată răspunsurile): ${codes.host}\n` +
      `  Le vezi oricând pe http://localhost:${process.env.PORT ?? 3000}/codes (doar de pe laptopul ăsta).\n` +
      `  Ca să le schimbi: șterge data/access.json și repornește.\n`,
  )
}

/** Codes are typed by hand, so case and stray spaces must not decide a match. */
export function normalise(code: string): string {
  return code.trim().toUpperCase()
}

/** The role a submitted code grants, or null if it matches neither. */
export function roleForCode(code: string): Role | null {
  const codes = accessCodes()
  const candidate = normalise(code)
  if (candidate.length === 0) return null
  if (candidate === codes.host) return 'host'
  if (candidate === codes.guest) return 'guest'
  return null
}
