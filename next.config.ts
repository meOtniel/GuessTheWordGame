import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // The game reads/writes JSON in ./data at runtime, so nothing may be
  // statically pre-rendered into a stale snapshot.
  reactStrictMode: true,
}

export default nextConfig
