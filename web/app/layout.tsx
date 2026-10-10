import type { Metadata, Viewport } from 'next'
import { Public_Sans } from 'next/font/google'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Logo } from '@/components/ui'
import './globals.css'

const publicSans = Public_Sans({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-public-sans', display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'Ripple: debt or savings first?', template: '%s | Ripple' },
  description: 'Compare three ways to pay down debt and build an emergency fund. An estimate, not financial advice.',
}

export const viewport: Viewport = { themeColor: '#181D27' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={publicSans.variable}>
      <body>
        <a href="#main" className="sr-only rounded-sm border-2 border-ink bg-paper px-4 py-2 font-bold focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50">
          Skip to content
        </a>
        <header className="on-ink bg-ink text-paper">
          <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center justify-between gap-x-6 gap-y-1 px-3 py-3 sm:px-4">
            <Link href="/" className="flex min-h-[44px] items-center gap-2.5 text-[1.35rem] font-bold tracking-[0.04em]">
              <Logo />
              Ripple
            </Link>
          </div>
        </header>
        <main id="main" className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-3 pt-4 pb-28 sm:px-4 min-[1100px]:pb-10">
          {children}
        </main>
        <footer className="mx-auto w-full max-w-[1600px] px-3 pb-28 text-[0.88rem] text-slate sm:px-4 min-[1100px]:pb-8">
          <p className="border-t border-line pt-4">
            Ripple is a personal project. It has no accounts and keeps your numbers in your browser. Example households are built from the Federal Reserve&rsquo;s{' '}
            <a className="link" href="https://www.federalreserve.gov/econres/scfindex.htm" rel="noreferrer">
              Survey of Consumer Finances
            </a>
            , 2022.
          </p>
        </footer>
      </body>
    </html>
  )
}
