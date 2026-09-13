/**
 * Runs once when the server boots.
 *
 * The access codes are minted and printed here rather than on the first
 * request that happens to need them, so the host sees them in the terminal
 * the moment the game starts — which is where they will look for them.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { accessCodes } = await import('@/server/access')
  accessCodes()
}
