import { NextResponse, type NextRequest } from 'next/server'
import { normalise, roleForCode, type Role } from '@/server/access'
import { isLocalPage, isLoopback, requiredRole, roleAllows } from '@/server/policy'

// Next 16 runs this file on the Node.js runtime, which is what lets it read
// the generated codes with node:fs and keeps the whole gate in one place
// instead of repeated in every route.

const COOKIE = 'access'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7

/** Where the code-entry screen lives. The one page that is always open. */
const GATE = '/access'

/** Query parameter carrying a code, so the QR on the console just works. */
const CODE_PARAM = 'k'

function deny(request: NextRequest, pathname: string): NextResponse {
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Cod de acces necesar.' }, { status: 401 })
  }
  const gate = new URL(GATE, request.url)
  gate.searchParams.set('next', pathname)
  return NextResponse.redirect(gate)
}

export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl
  if (pathname === GATE) return NextResponse.next()

  // The codes page exists only for the laptop running the game. Anywhere else
  // it is simply not there: a 404 rather than a redirect to the gate, which
  // would send the host round a loop no code could ever break.
  if (isLocalPage(pathname)) {
    if (isLoopback(request.headers.get('x-forwarded-for'))) return NextResponse.next()
    return new NextResponse('Not found', { status: 404 })
  }

  const needed = requiredRole(pathname, searchParams, request.method)

  // A code in the URL is how the QR code and the entry form both arrive. It is
  // swapped for a cookie and stripped straight away, so it never lingers in
  // the tablet's history or in a screenshot of the address bar.
  const offered = searchParams.get(CODE_PARAM)
  if (offered !== null) {
    const role = roleForCode(offered)
    if (role === null) {
      // Slow enough that guessing a six-character code stops being a plan,
      // cheap enough that a mistyped one still feels instant.
      await new Promise((resolve) => setTimeout(resolve, 500))
      const gate = new URL(GATE, request.url)
      gate.searchParams.set('next', pathname)
      gate.searchParams.set('e', '1')
      return NextResponse.redirect(gate)
    }

    const clean = new URL(request.url)
    clean.searchParams.delete(CODE_PARAM)
    const response = roleAllows(role, needed) ? NextResponse.redirect(clean) : deny(request, pathname)
    // The cookie carries the code itself, not the role it earned. A role would
    // be a claim the browser could simply assert; the code is the secret, so
    // forging the cookie means already knowing it.
    response.cookies.set(COOKIE, normalise(offered), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: COOKIE_MAX_AGE,
      // No Secure flag: the game is served over plain http on the local
      // network, and a Secure cookie would simply never be sent back.
    })
    return response
  }

  const cookie = request.cookies.get(COOKIE)?.value
  const role = cookie === undefined ? null : roleForCode(cookie)
  if (roleAllows(role, needed)) return NextResponse.next()
  return deny(request, pathname)
}

export const config = {
  // Everything except Next's own assets and the favicon, so a route added
  // later is covered without anyone having to remember this file.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
