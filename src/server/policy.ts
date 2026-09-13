import type { Role } from './access'

/**
 * Who is allowed to reach what.
 *
 * Kept apart from the proxy that enforces it, and free of any filesystem or
 * request handling, so the rules can be read in one screen and tested
 * directly — this is the file to check when asking "can a guest do that?".
 */

/**
 * What a guest device may call, down to the method: everything under /api is
 * host-only unless it is listed here, so an endpoint added later is locked to
 * the moderator until someone deliberately opens it up.
 *
 * The method matters. Reading /api/session is how the tablet follows the game,
 * but POSTing to it starts a new session and DELETE wipes the one in progress
 * — those belong to the host alone.
 */
export const GUEST_API: Record<string, readonly string[]> = {
  '/api/session': ['GET'],
  '/api/stream': ['GET'],
  '/api/turn': ['POST'],
  '/api/answer': ['POST'],
  '/api/placement': ['POST'],
  '/api/hint': ['POST'],
  '/api/expire': ['POST'],
}

/**
 * Pages that open for the laptop running the game instead of for a code.
 *
 * The codes page is the way back in once the terminal has scrolled past the
 * boot message, so putting it behind the host code would be a lock with its
 * key shut inside the box. Being sat at the machine is the credential.
 */
export const LOCAL_PAGES = ['/codes']

export function isLocalPage(pathname: string): boolean {
  return LOCAL_PAGES.includes(pathname)
}

/**
 * Whether a request came from the machine itself.
 *
 * The address arrives as x-forwarded-for, which Next fills in from the socket.
 * Nothing sits in front of this server, so the header is the socket — but a
 * client on the network can still send one of its own, which is why this gates
 * only the codes page and nothing that changes the game.
 */
export function isLoopback(forwardedFor: string | null): boolean {
  if (forwardedFor === null) return false
  // A forwarding chain lists the client first; without a proxy there is one entry.
  const client = forwardedFor.split(',')[0].trim().replace(/^::ffff:/, '')
  return client === '::1' || client.startsWith('127.')
}

/** Pages a guest device may open. /admin is deliberately absent. */
export const GUEST_PAGES = ['/', '/play', '/display']

export function requiredRole(pathname: string, search: URLSearchParams, method: string): Role {
  if (pathname.startsWith('/api/')) {
    // ?host=1 asks for the moderator's view of the state, which carries the
    // answer to the current question — that is a host privilege, not a route.
    if (search.get('host') === '1') return 'host'
    return GUEST_API[pathname]?.includes(method) ? 'guest' : 'host'
  }
  return GUEST_PAGES.includes(pathname) ? 'guest' : 'host'
}

/** The host code opens everything; the guest code opens only guest surfaces. */
export function roleAllows(role: Role | null, required: Role): boolean {
  if (role === 'host') return true
  return role === 'guest' && required === 'guest'
}
