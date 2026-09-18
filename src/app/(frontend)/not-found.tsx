import type { Metadata } from 'next'

import { A, Container } from '@/components/ui'
import { rv } from '@/lib/format'

export const metadata: Metadata = { title: 'Page not found', robots: { index: false } }

/**
 * Rendered for `notFound()` from a frontend route (an unknown meme or token slug) and for
 * unmatched URLs. Uses the same shell as an item page so the nav and footer stay in place.
 */
export default function NotFound() {
  return (
    <section className="section project-single meme-page-header">
      <Container>
        <div className="project-single-wrapper">
          <div className="project-single-top-wrap">
            <h1 className="project-single-title meme" {...rv(300)}>
              Page not found
            </h1>
          </div>
        </div>
        <div className="project-single-wrapper">
          <div className="project-single-bottom-line" />
          <div className="meme-page-content-container">
            <div className="meme-page-item-container">
              <div className="project-client-description">
                This page has moved or never existed. The treasury is still where you left it.
              </div>
              <A href="/" className="project-client-name">
                BACK TO THE BUREAU →
              </A>
            </div>
          </div>
        </div>
      </Container>
    </section>
  )
}
