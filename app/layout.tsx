import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { cookies } from 'next/headers'
import { parseTheme, THEME_COOKIE, themeColor } from '@/lib/theme'
import { Analytics } from '@/components/analytics'
import type { ReactNode } from 'react'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Mimir',
  description: 'Long-term memory for your agents.',
}

export const instant = false

export async function generateViewport(): Promise<Viewport> {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value)
  return { themeColor: themeColor(theme) }
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Resolved on the server so the first paint already carries the right theme:
  // a client-side swap would flash the default before settling.
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value)

  return (
    <html lang="en" data-theme={theme} className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <Analytics />
        {children}
      </body>
    </html>
  )
}
