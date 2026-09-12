import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { FinishedSession, Session } from '@/lib/types'

const DATA_DIR = path.join(process.cwd(), 'data')
const SESSION_FILE = path.join(DATA_DIR, 'session.json')
const LAST_SESSION_FILE = path.join(DATA_DIR, 'last-session.json')

const DEBOUNCE_MS = 150

/**
 * Write via temp file + rename so a crash mid-write can never leave a
 * half-written session behind — the old file stays intact until the new one is
 * complete. This runs on a laptop at a reception; a corrupt state file would
 * end the game.
 */
async function atomicWrite(file: string, data: unknown): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await rename(tmp, file)
}

interface PersistState {
  timer: NodeJS.Timeout | null
  pending: Session | null
  writing: Promise<void>
}

const persistState: PersistState = { timer: null, pending: null, writing: Promise.resolve() }

async function writePending(): Promise<void> {
  const session = persistState.pending
  persistState.pending = null
  persistState.timer = null
  if (!session) return
  try {
    // savedAt lets a restart measure its own downtime and refund it to the
    // player, instead of charging them for a crash.
    await atomicWrite(SESSION_FILE, { ...session, savedAt: Date.now() })
  } catch (err) {
    // Never let a disk hiccup take down a live game — the in-memory session
    // remains authoritative, we just lose crash-recovery for this moment.
    console.error('[persistence] nu am putut salva sesiunea:', err)
  }
}

/** Queue a save. Rapid-fire mutations collapse into one write. */
export function schedulePersist(session: Session): void {
  persistState.pending = session
  if (persistState.timer) return
  persistState.timer = setTimeout(() => {
    persistState.writing = persistState.writing.then(writePending)
  }, DEBOUNCE_MS)
}

/** Force any queued save to disk now — used before the process exits. */
export async function flushPersist(): Promise<void> {
  if (persistState.timer) {
    clearTimeout(persistState.timer)
    persistState.timer = null
  }
  persistState.writing = persistState.writing.then(writePending)
  await persistState.writing
}

/** Synchronous so the store can rehydrate during module initialisation. */
export function loadSessionSync(): Session | null {
  try {
    return JSON.parse(readFileSync(SESSION_FILE, 'utf8')) as Session
  } catch {
    return null
  }
}

export async function saveLastSession(finished: FinishedSession): Promise<void> {
  try {
    await atomicWrite(LAST_SESSION_FILE, finished)
  } catch (err) {
    console.error('[persistence] nu am putut salva clasamentul final:', err)
  }
}

export async function loadLastSession(): Promise<FinishedSession | null> {
  try {
    return JSON.parse(await readFile(LAST_SESSION_FILE, 'utf8')) as FinishedSession
  } catch {
    return null
  }
}

export function loadLastSessionSync(): FinishedSession | null {
  try {
    return JSON.parse(readFileSync(LAST_SESSION_FILE, 'utf8')) as FinishedSession
  } catch {
    return null
  }
}
