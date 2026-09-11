import Link from 'next/link'

import type { Site } from '@/payload-types'
import { rels, rv } from '@/lib/format'

import { Marked } from './Marked'
import { A, Arrows, Container, SectionTop } from './ui'

type L = { label: string; href: string; newTab?: boolean }

function Column({ title, links, delay }: { title: string; links: L[]; delay: number }) {
  return (
    <div className="footer-single-wrap" {...rv(delay)}>
      <div className="footer-single-title">{title}</div>
      <div className="footer-all-link-wrap">
        {links.map((l) => (
          <A key={l.href + l.label} href={l.href} newTab={l.newTab} className="footer-menu-link">
            {l.label}
          </A>
        ))}
      </div>
    </div>
  )
}

export function Footer({ site }: { site: Site }) {
  const { cta, footer } = site
  const memeLinks = rels(footer?.memes).map((m) => ({ label: m.name, href: `/memes/${m.slug}`, newTab: true }))

  return (
    <div id="Footer" className="cta-footer-wrap">
      <section className="section cta">
        <Container>
          <div className="cta-wrapper">
            <SectionTop label={cta?.label} />
            <div className="cta-wrap" {...rv(700)}>
              <h2 className="cta-title footer" {...rv(500)}>
                <Marked text={cta?.title} />
              </h2>
              {cta?.link?.href && (
                <div className="cta-btn-wrap" {...rv(600)}>
                  <A href={cta.link.href} className="secondary-button w-inline-block">
                    <div className="secondary-btn-flex-wrap">
                      <div className="secondary-btn-wrap">
                        <div className="secondary-btn-text">{cta.link.label}</div>
                        <img src="/icons/secondary-btn.svg" alt="" className="secondary-btn-icon" />
                      </div>
                      <div className="secondary-btn-line" />
                    </div>
                  </A>
                </div>
              )}
            </div>
          </div>
        </Container>
      </section>
      <section className="section footer">
        <Container>
          <div className="footer-wrapper">
            <div className="footer-flex-wrap">
              <div className="footer-left-wrap" {...rv(300)}>
                <Link href="/" className="footer-link-image w-inline-block">
                  <img src="/brand/bic-logo.svg" alt="Bureau of Internet Culture" className="footer-image" />
                </Link>
                <div className="footer-details">{site.description}</div>
              </div>
              <div className="footer-right-wrap">
                <Column title="Org" links={footer?.orgLinks ?? []} delay={400} />
                <Column title="Memes" links={memeLinks} delay={500} />
                <Column title="Token" links={footer?.tokenLinks ?? []} delay={600} />
              </div>
            </div>
            <div className="footer-social-wrap">
              <div className="footer-social-grid-wrap" {...rv(700)}>
                {footer?.socialLinks?.map((l) => (
                  <A key={l.id} href={l.href} className="footer-social-link w-inline-block">
                    <div className="footer-social-link-wrap">
                      <div className="footer-social-text">{l.label}</div>
                      <Arrows second="/icons/arrow-brown.svg" />
                    </div>
                  </A>
                ))}
              </div>
            </div>
            <div className="footer-bottom-line" {...rv(800, 'grow-big')} />
            <div className="footer-copyright-text" {...rv(900)}>
              {footer?.contract}
            </div>
            <div className="footer-copyright-text" {...rv(900)}>
              {footer?.copyright}
            </div>
          </div>
        </Container>
      </section>
    </div>
  )
}
