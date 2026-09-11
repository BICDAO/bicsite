import config from '@payload-config'
import { getPayload } from 'payload'
import { cache } from 'react'

const client = () => getPayload({ config })

/** Public queries run with access control (published content only). */
const pub = { overrideAccess: false } as const

export const getSite = cache(async () => (await client()).findGlobal({ slug: 'site', depth: 1, ...pub }))
export const getHome = cache(async () => (await client()).findGlobal({ slug: 'home', depth: 2, ...pub }))
export const getProvenance = cache(async () => (await client()).findGlobal({ slug: 'provenance', depth: 1, ...pub }))

const list = <C extends 'memes' | 'liquid-assets'>(collection: C) =>
  cache(async () => (await (await client()).find({ collection, depth: 1, pagination: false, sort: 'sortOrder', ...pub })).docs)

export const getMemes = list('memes')
export const getLiquidAssets = list('liquid-assets')

export const getItem = cache(async <C extends 'memes' | 'liquid-assets'>(collection: C, slug: string) => {
  const { docs } = await (await client()).find({ collection, depth: 1, limit: 1, where: { slug: { equals: slug } }, ...pub })
  return docs[0]
})
