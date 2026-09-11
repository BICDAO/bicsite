import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import type { Media } from '@/payload-types'
import { rel, rv } from '@/lib/format'

import { Container, Img } from './ui'

type Item = {
  name: string
  description?: string | null
  image?: number | Media | null
  thumbnail?: number | Media | null
}

export const itemMetadata = (item?: Item): Metadata => {
  if (!item) return {}
  const og = rel(item.thumbnail)?.url
  const description = item.description ?? undefined
  return {
    title: item.name,
    description,
    openGraph: { title: `${item.name} — Bureau of Internet Culture`, description, images: og ? [og] : undefined },
  }
}

/** Label always shown; value only when set (Webflow hid empty bindings). */
export function Detail({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <>
      <div className="project-client-name">{label}</div>
      {value ? <div className="project-client-description">{value}</div> : null}
    </>
  )
}

export function ExtLink({ href, label }: { href?: string | null; label: string }) {
  return href ? (
    <a href={href} target="_blank" className="project-client-name">
      {label} →
    </a>
  ) : null
}

/** Shared template for /memes/[slug] and /liquid-assets/[slug]. */
export function ItemPage({ item, details }: { item: Item; details: ReactNode }) {
  return (
    <section className="section project-single meme-page-header">
      <Container>
        <div className="project-single-wrapper">
          <div className="project-single-top-wrap">
            <h1 className="project-single-title meme" {...rv(300)}>
              {item.name}
            </h1>
            <Img media={item.image} className="meme-page-image" sizes="(max-width: 479px) 100vw, 50vw" priority />
          </div>
        </div>
        <div className="project-single-wrapper">
          <div className="project-single-bottom-line" />
          <div className="meme-page-content-container">
            <div className="meme-page-item-container">{details}</div>
            <div className="meme-page-item-container">
              <Detail label="Description" value={item.description} />
            </div>
          </div>
        </div>
      </Container>
    </section>
  )
}
