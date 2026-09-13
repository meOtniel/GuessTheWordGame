import { Card } from '@/components/ui'
import { accessCodes } from '@/server/access'

export const dynamic = 'force-dynamic'

/**
 * The two access codes, on screen.
 *
 * They are printed in the terminal at boot, but by the time someone needs to
 * read one out the terminal has scrolled away and nobody wants to hunt for it
 * mid-reception. Only the laptop running the game can open this page — the
 * proxy answers 404 to everyone else — so it is not another door into the
 * game, just a larger copy of what the terminal already said.
 */
export default async function CodesPage() {
  const { guest, host } = accessCodes()

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div className="text-center">
        <h1 className="font-display text-plum text-4xl font-bold">Coduri de acces</h1>
        <p className="text-ink-soft mt-2">Pagina asta se deschide doar pe laptopul care ține jocul.</p>
      </div>

      <Code code={guest} title="Invitați" note="Tabletă și proiector. Ăsta se dictează sau se scanează." />
      <Code code={host} title="Gazdă" note="Deschide și consola, care arată răspunsurile. Nu-l da mai departe." />

      <p className="text-ink-soft text-center text-sm">
        Ca să le schimbi: șterge <code>data/access.json</code> și repornește jocul.
      </p>
    </main>
  )
}

function Code({ code, title, note }: { code: string; title: string; note: string }) {
  return (
    <Card>
      <h2 className="font-display text-plum text-lg font-bold">{title}</h2>
      {/* Spaced out and oversized, because it gets read across a room. */}
      <p className="font-display text-ink my-2 text-center text-5xl font-bold tracking-[0.2em] select-all">{code}</p>
      <p className="text-ink-soft text-sm">{note}</p>
    </Card>
  )
}
