/** Explicit URL, else Vercel's production domain, else local dev. */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
  'http://localhost:3000'

/** Absolute URL for `path` ("/", "/memes/harambe", …), for metadata and the sitemap. */
export const absolute = (path: string) => new URL(path, SITE_URL).toString()
