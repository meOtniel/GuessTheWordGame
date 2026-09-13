import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Ghicește Cuvântul',
  description: 'Joc de ghicit cuvinte pentru nuntă',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#4a2545',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro">
      {/*
        Extensions such as Grammarly add their own attributes to <body> before
        React hydrates, which React otherwise reports as a mismatch. The warning
        is suppressed one level deep, on the element they touch — not on the
        tree inside it, where a real mismatch would still be worth hearing.
      */}
      <body className="min-h-screen antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
