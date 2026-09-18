import type { MetadataRoute } from 'next'

import { absolute } from '@/lib/site'
import { getLiquidAssets, getMemes } from '@/lib/payload'

/**
 * Every public URL. `getMemes`/`getLiquidAssets` run with access control, so drafts
 * are excluded here the same way they are excluded from the site itself.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [memes, assets] = await Promise.all([getMemes(), getLiquidAssets()])

  const item = (prefix: string) => (doc: { slug?: string | null; updatedAt?: string | null }) => ({
    url: absolute(`${prefix}/${doc.slug}`),
    lastModified: doc.updatedAt ?? undefined,
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  })

  return [
    { url: absolute('/'), changeFrequency: 'weekly', priority: 1 },
    { url: absolute('/provenance'), changeFrequency: 'monthly', priority: 0.8 },
    ...memes.map(item('/memes')),
    ...assets.map(item('/liquid-assets')),
  ]
}
