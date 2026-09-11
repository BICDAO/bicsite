import type { Metadata } from 'next'
import localFont from 'next/font/local'
import React from 'react'

import { Footer } from '@/components/Footer'
import { Nav } from '@/components/Nav'
import { RevealObserver } from '@/components/RevealObserver'
import { rel } from '@/lib/format'
import { getSite } from '@/lib/payload'

import './webflow.css'
import './site.css'

const funnel = localFont({
  src: [
    { path: '../fonts/FunnelSans-Regular.ttf', weight: '400' },
    { path: '../fonts/FunnelSans-Medium.ttf', weight: '500' },
  ],
  variable: '--font-funnel',
})

const creato = localFont({
  src: [
    { path: '../fonts/CreatoDisplay-Regular.otf', weight: '400' },
    { path: '../fonts/CreatoDisplay-Medium.otf', weight: '500' },
  ],
  variable: '--font-creato',
})

const NAME = 'Bureau of Internet Culture'

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite()
  const og = rel(site.ogImage)?.url
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
    title: { default: NAME, template: `%s — ${NAME}` },
    description: site.description,
    openGraph: { title: NAME, description: site.description ?? undefined, type: 'website', images: og ? [og] : undefined },
    twitter: { card: 'summary_large_image' },
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const site = await getSite()

  return (
    <html lang="en" className={`${funnel.variable} ${creato.variable}`}>
      <body>
        <noscript>
          <style>{'[data-reveal]{opacity:1!important;transform:none!important}'}</style>
        </noscript>
        <div className="pages-wrapper">
          <Nav nav={site.nav} />
          {children}
          <Footer site={site} />
        </div>
        <RevealObserver />
      </body>
    </html>
  )
}
