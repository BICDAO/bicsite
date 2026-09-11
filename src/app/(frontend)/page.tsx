import type { LiquidAsset, Meme } from '@/payload-types'
import { ManifestoItem } from '@/components/ManifestoItem'
import { Marked } from '@/components/Marked'
import { A, ArrowLink, Container, FeatureCard, FeatureGrid, Img, SectionTop } from '@/components/ui'
import { dateDots, dateIso, rels, rv } from '@/lib/format'
import { getHome, getLiquidAssets, getMemes } from '@/lib/payload'

function MemeRow({ memes, wrapper, nested }: { memes: Meme[]; wrapper: string; nested?: boolean }) {
  // Two identical copies make the marquee loop seamlessly.
  return [0, 1].map((copy) => (
    <div key={copy} className={wrapper} aria-hidden={copy === 1 || undefined}>
      <div className="collection-list w-row">
        {memes.map((m) => {
          const link = <ArrowLink date={dateDots(m.dateAcquired)} />
          return (
            <div key={m.id} className="cms-header-item w-col w-col-2">
              <A href={`/memes/${m.slug}`} newTab className="header-item-link-block w-inline-block">
                <div className="cms-image-block">
                  <Img media={m.thumbnail} className="image-3" sizes="16vw" />
                  {nested && link}
                </div>
                {!nested && link}
              </A>
            </div>
          )
        })}
      </div>
    </div>
  ))
}

function TreasuryRow({ href, children, hoverImage }: { href: string; children: React.ReactNode; hoverImage?: Meme['thumbnail'] }) {
  return (
    <div className="collection-item w-clearfix">
      <A href={href} newTab className="treasury-v1-single-warp _01 w-inline-block w-clearfix">
        {children}
        <div className="treasury-button">
          <img src="/icons/treasury-button.svg" alt="" />
        </div>
      </A>
      {hoverImage && (
        <div className="treasury-image-hover-container">
          <Img media={hoverImage} className="image-6" sizes="20vw" />
        </div>
      )}
    </div>
  )
}

export default async function HomePage() {
  const [{ hero, explainer, treasury, manifesto, creators }, memes, assets] = await Promise.all([
    getHome(),
    getMemes(),
    getLiquidAssets(),
  ])

  return (
    <>
      <section className="section hero">
        <Container>
          <div className="hero-wrapper">
            <div className="hero-social-wrap" {...rv(300)}>
              {hero?.links?.map((l) => <ArrowLink key={l.id} href={l.href} label={l.label} />)}
            </div>
            <div className="hero-top-wrap">
              <h1 className="hero-title" {...rv(400)}>
                <Marked text={hero?.title} />
              </h1>
            </div>
          </div>
        </Container>
      </section>
      <div className="hero-bg-wrap" {...rv(600)}>
        <div className="header-carousel-slider-one">
          <MemeRow memes={rels(hero?.row1)} wrapper="collection-list-wrapper-header-one" />
        </div>
        <div className="header-carousel-slider-two">
          <MemeRow memes={rels(hero?.row2)} wrapper="collection-list-wrapper-header-two" nested />
        </div>
      </div>

      <section id="Explainer" className="section blog-v1">
        <Container>
          <div className="blog-v1-wrapper">
            <SectionTop label={explainer?.label} />
            <div className="blog-v1-wrap">
              <div className="blog-cl-list-wrapper">
                <div className="blog-v1-grid-wrap">
                  {explainer?.cards?.map((c) => <FeatureCard key={c.id} card={c} />)}
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      <section id="Treasury" className="section awards-v1">
        <Container>
          <div className="treasury-v1-wrapper">
            <SectionTop label={treasury?.label} />
            <div className="section-flex-wrap liquid-assets-header" {...rv(400)}>
              <div className="section-sub-title">{treasury?.nftsLabel}</div>
            </div>
            <div className="treasury-v1-flex-wrap" {...rv(700)}>
              {memes.map((m) => (
                <TreasuryRow key={m.id} href={`/memes/${m.slug}`} hoverImage={m.thumbnail}>
                  <div className="treasury-first-column">
                    <div className="treasury-title">{m.name}</div>
                  </div>
                  <div className="treasury-third-column">
                    <div className="treasury">{m.creator}</div>
                  </div>
                  <div className="treasury-fourth-column">
                    <div className="awards-single-text">{dateIso(m.dateAcquired)}</div>
                  </div>
                </TreasuryRow>
              ))}
            </div>
            <div className="section-flex-wrap liquid-assets-header" {...rv(400)}>
              <div className="section-sub-title">{treasury?.tokensLabel}</div>
            </div>
            <div className="treasury-v1-flex-wrap liquid-assets" {...rv(700)}>
              {assets.map((a: LiquidAsset) => (
                <TreasuryRow key={a.id} href={`/liquid-assets/${a.slug}`}>
                  <div className="liquid-assets-first-column">
                    <div className="treasury-title">{a.name}</div>
                  </div>
                  <div className="liquid-assets-second-column">
                    <div className="treasury-tag-meme">{a.ticker}</div>
                  </div>
                </TreasuryRow>
              ))}
            </div>
          </div>
        </Container>
      </section>

      <section id="Provenance" className="section awards-v1">
        <Container>
          <div className="awards-v1-wrapper">
            <SectionTop label={manifesto?.label} />
            <div className="awards-v1-wrap">
              <div className="headline-block-20">
                <h2 className="about-v1-details" {...rv(500)}>
                  <Marked text={manifesto?.title} />
                </h2>
              </div>
              <div className="awards-v1-flex-wrap" {...rv(500)}>
                {manifesto?.items?.map((it, i) => (
                  <ManifestoItem key={it.id} n={String(i + 1).padStart(2, '0')} title={it.title} body={it.body} />
                ))}
                {manifesto?.link?.href && (
                  <div className="manifesto-section-link">
                    <ArrowLink href={manifesto.link.href} label={manifesto.link.label} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </Container>
      </section>

      <section id="Creators" className="section blog-v1">
        <Container>
          <div className="blog-v1-wrapper">
            <SectionTop label={creators?.label} />
            {creators && <FeatureGrid card={creators} imageClass="image-4" />}
          </div>
        </Container>
      </section>
    </>
  )
}
