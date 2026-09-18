import type { MetadataRoute } from 'next'

import { absolute } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    // `/admin` is the CMS and `/api` is Payload's REST surface; neither belongs in an index.
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/api'] },
    sitemap: absolute('/sitemap.xml'),
  }
}
