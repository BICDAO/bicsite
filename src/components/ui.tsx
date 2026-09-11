import { RichText, type JSXConvertersFunction } from '@payloadcms/richtext-lexical/react'
import Image from 'next/image'
import Link from 'next/link'
import type { ComponentProps, HTMLAttributes, ReactNode } from 'react'

import type { Media } from '@/payload-types'
import { isExternal, rel, rv } from '@/lib/format'

import { Marked } from './Marked'

type Reveal = HTMLAttributes<HTMLElement>

/** Anchor that opens external (or `newTab`) links in a new tab and uses client routing internally. */
export function A({ href, newTab, ...props }: ComponentProps<'a'> & { href: string; newTab?: boolean }) {
  if (isExternal(href) || newTab) return <a href={href} target="_blank" {...props} />
  if (href.startsWith('#')) return <a href={href} {...props} />
  return <Link href={href} {...props} />
}

export function Container({ children }: { children: ReactNode }) {
  return <div className="w-layout-blockcontainer container w-container">{children}</div>
}

export function SectionTop({ label }: { label?: string | null }) {
  return (
    <div className="section-top-wrap">
      <div className="section-top-line" {...rv(300, 'grow')} />
      <div className="section-flex-wrap" {...rv(400)}>
        <div className="section-sub-title">{label}</div>
      </div>
    </div>
  )
}

function Arrows({ second = '/icons/arrow.svg' }: { second?: string }) {
  return (
    <div className="hero-link-right-wrap">
      <img src="/icons/arrow.svg" alt="" className="hero-link-icon" />
      <img src={second} alt="" className="hero-link-icon" />
    </div>
  )
}
export { Arrows }

/** "hero-single-link-wrap": label + sliding arrow + growing underline. Renders a div when no href. */
export function ArrowLink({
  href,
  label,
  date,
  newTab,
  ...reveal
}: { href?: string | null; label?: ReactNode; date?: string; newTab?: boolean } & Reveal) {
  const inner = (
    <>
      <div className="hero-link-flex-wrap">
        {date ? (
          <div className="hero-link-left-wrap date-acquired">
            <div className="hero-link-title-text acquired">ACQUIRED </div>
            <div className="hero-link-title-text date">{date}</div>
          </div>
        ) : (
          <div className="hero-link-left-wrap">
            <div className="hero-link-title-text">{label}</div>
          </div>
        )}
        <Arrows />
      </div>
      <div className="hero-link-line">
        <div className="hero-link-white-line" />
      </div>
    </>
  )
  if (!href) return <div className="hero-single-link-wrap" {...reveal}>{inner}</div>
  return (
    <A href={href} newTab={newTab} className="hero-single-link-wrap w-inline-block" {...reveal}>
      {inner}
    </A>
  )
}

export function Img({
  media,
  className,
  sizes = '100vw',
  priority,
}: { media?: number | Media | null; className?: string; sizes?: string; priority?: boolean }) {
  const m = rel(media)
  if (!m?.url) return null
  return (
    <Image
      src={m.url}
      alt={m.alt}
      width={m.width ?? 1200}
      height={m.height ?? 1200}
      className={className}
      sizes={sizes}
      priority={priority}
      unoptimized={m.mimeType === 'image/svg+xml'}
    />
  )
}

/** Inline rich text: paragraphs render as bare content so Webflow block styles apply. */
const inline: JSXConvertersFunction = ({ defaultConverters }) => ({
  ...defaultConverters,
  paragraph: ({ node, nodesToJSX }) => <>{nodesToJSX({ nodes: node.children })}</>,
})

export function Rich({ data }: { data?: ComponentProps<typeof RichText>['data'] | null }) {
  return data ? <RichText data={data} converters={inline} disableContainer /> : null
}

type Card = {
  category?: string | null
  title?: string | null
  subtitle?: string | null
  body?: ComponentProps<typeof RichText>['data'] | null
  link?: { label?: string | null; href?: string | null } | null
  image?: number | Media | null
}

export function FeatureCard({ card, className = '' }: { card: Card; className?: string }) {
  return (
    <div className={`blog-v1-cl-item-wrap ${className}`}>
      <div className="blog-v1-single-wrap">
        <div className="blog-v1-single-item-wrap">
          <div className="blog-v1-ctg-wrap" {...rv(600)}>
            <div className="blog-v1-ctg-text">{card.category}</div>
          </div>
          <div className="blog-v1-single-title-large" {...rv(700)}>
            <Marked text={card.title} />
          </div>
          <div className="blog-v1-subtitle" {...rv(700)}>
            {card.subtitle}
          </div>
          <div className="blog-v1-paragraph" {...rv(700)}>
            <Rich data={card.body} />
          </div>
          {card.link?.href && <ArrowLink href={card.link.href} label={card.link.label} {...rv(700)} />}
        </div>
      </div>
    </div>
  )
}

/** Card + image side panel (home creators, provenance feature). */
export function FeatureGrid({ card, imageClass }: { card: Card; imageClass: string }) {
  return (
    <div className="blog-v1-wrap">
      <div className="blog-cl-list-wrapper">
        <div className="blog-v1-grid-wrap">
          <FeatureCard card={card} className="feature-card" />
          <div className="blog-v1-cl-item-wrap-copy feature-image" {...rv(700)}>
            <Img media={card.image} className={imageClass} sizes="50vw" />
          </div>
        </div>
      </div>
    </div>
  )
}
