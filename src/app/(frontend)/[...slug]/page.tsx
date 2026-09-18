import { notFound } from 'next/navigation'

/**
 * Catches every URL no other route matches and raises notFound(), so the miss is handled inside
 * the frontend layout and renders `(frontend)/not-found.tsx` with the nav and footer.
 *
 * Without this, an unmatched URL never enters a route group — and with two root layouts there is
 * no single layout Next can compose a global 404 from, so it falls back to its own bare page.
 * More specific routes (/memes/[slug], /admin, /api, sitemap.xml, …) still win over this one.
 */
export default function CatchAll(): never {
  notFound()
}
