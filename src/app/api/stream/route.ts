import { ensureCategories } from '@/server/bootstrap'
import { publicState, subscribe, syncClock } from '@/server/session-store'

export const dynamic = 'force-dynamic'

/**
 * Server-sent events: every mutation is pushed to the play screen, the admin
 * panel and the projector at once, so the three views can never drift apart.
 *
 * A heartbeat keeps the connection alive through proxies and also re-settles
 * the clock, which is what catches a question whose timer expired while the
 * tab was in the background.
 */
export async function GET(request: Request) {
  await ensureCategories()
  const host = new URL(request.url).searchParams.get('host') === '1'
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      let closed = false

      const send = (data: unknown) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {
          closed = true
        }
      }

      send(publicState({ host }))
      const unsubscribe = subscribe(send, { host })

      const heartbeat = setInterval(() => {
        if (closed) return
        syncClock()
        send(publicState({ host }))
      }, 5000)

      const close = () => {
        if (closed) return
        closed = true
        clearInterval(heartbeat)
        unsubscribe()
        try {
          controller.close()
        } catch {
          // already closed by the runtime
        }
      }

      request.signal.addEventListener('abort', close)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
