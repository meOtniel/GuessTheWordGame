import { AccessForm } from '@/components/AccessForm'

export const dynamic = 'force-dynamic'

export default async function AccessPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; e?: string }>
}) {
  const params = await searchParams
  // Only same-site paths may be redirected to, so a doctored link cannot use
  // this screen to bounce a guest somewhere else.
  const target = params.next?.startsWith('/') && !params.next.startsWith('//') ? params.next : '/'

  return <AccessForm next={target} failed={params.e === '1'} />
}
