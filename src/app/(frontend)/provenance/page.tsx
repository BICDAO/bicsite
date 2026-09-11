import type { Metadata } from 'next'

import { Marked } from '@/components/Marked'
import { A, Container, FeatureGrid, Img, Rich, SectionTop } from '@/components/ui'
import { rel, rv } from '@/lib/format'
import { getProvenance } from '@/lib/payload'

export async function generateMetadata(): Promise<Metadata> {
  const og = rel((await getProvenance()).hero?.image)?.url
  return { title: 'Provenance', openGraph: { title: 'Provenance — Bureau of Internet Culture', images: og ? [og] : undefined } }
}

export default async function ProvenancePage() {
  const { hero, mission, records, feature } = await getProvenance()

  return (
    <>
      <section className="section about">
        <Container>
          <div className="about-wrapper">
            <div className="about-top-wrap">
              <h1 className="about-title" {...rv(300)}>
                <Marked text={hero?.title} />
              </h1>
            </div>
            <div className="section-middle-wrap">
              <div className="section-flex-wrap" {...rv(400)}>
                <div className="section-sub-title half-opacity">{hero?.subtitle}</div>
              </div>
            </div>
            <div className="about-wrap" {...rv(500)}>
              <Img
                media={hero?.image}
                className="about-image"
                sizes="(max-width: 767px) 100vw, (max-width: 991px) 728px, 940px"
                priority
              />
            </div>
          </div>
        </Container>
      </section>

      <section className="section mission">
        <Container>
          <div className="mission-wrapper">
            <div className="mission-top-wrap">
              <SectionTop label={mission?.label} />
            </div>
            <div className="mission-wrap">
              <div className="mission-flex-wrap">
                {mission?.blocks?.map((b) => (
                  <div key={b.id} style={{ display: 'contents' }}>
                    <h3 className="mission-title" {...rv(500)}>
                      <Marked text={b.title} />
                    </h3>
                    <div className="mission-details" {...rv(600)}>
                      <Rich data={b.body} />
                    </div>
                  </div>
                ))}
                {mission?.link?.href && (
                  <A href={mission.link.href} className="member-name">
                    <Marked text={mission.link.label} />
                  </A>
                )}
              </div>
            </div>
          </div>
        </Container>
      </section>

      <section className="section about-v1">
        <Container>
          <div className="about-v1-wrapper">
            <SectionTop label={records?.label} />
            <div className="about-v1-wrap">
              <div className="about-v1-left-wrap" {...rv(500)} />
              <div className="about-v1-right-wrap">
                {records?.link?.href && (
                  <A href={records.link.href} className="about-v1-details" {...rv(500)}>
                    {records.link.label}
                  </A>
                )}
                <h2 className="about-v1-details half-opacity" {...rv(500)}>
                  {records?.note}
                </h2>
              </div>
            </div>
          </div>
        </Container>
      </section>

      <section id="Creators" className="section blog-v1">
        <Container>
          <div className="blog-v1-wrapper">
            <SectionTop label={feature?.label} />
            {feature && <FeatureGrid card={feature} imageClass="image-5" />}
          </div>
        </Container>
      </section>
    </>
  )
}
