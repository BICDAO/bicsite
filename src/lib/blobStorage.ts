import { cloudStoragePlugin } from '@payloadcms/plugin-cloud-storage'
import type { Adapter } from '@payloadcms/plugin-cloud-storage/types'
import { getFileKey } from '@payloadcms/plugin-cloud-storage/utilities'
import { del, put } from '@vercel/blob'
import path from 'path'
import type { Plugin, UploadCollectionSlug } from 'payload'

/**
 * Vercel Blob storage for Payload authenticated with OIDC (BLOB_STORE_ID + VERCEL_OIDC_TOKEN, read by
 * @vercel/blob). Payload's official adapter only accepts a static read-write token.
 * Files are public: media URLs point at the Blob CDN; Payload's file route just redirects there.
 * Without BLOB_STORE_ID (local dev) Payload keeps its default local-disk storage.
 */
const storeId = process.env.BLOB_STORE_ID?.replace(/^store_/, '').toLowerCase()
const baseUrl = `https://${storeId}.public.blob.vercel-storage.com`

/**
 * Prefer a static read-write token when one is configured. Left to itself @vercel/blob reaches for
 * VERCEL_OIDC_TOKEN, which is scoped to this project and is rejected by a store owned elsewhere —
 * so uploads fail with "Access denied" anywhere the store is not the project's own. A store token
 * carries its own authority and works both on Vercel and from a laptop running the importer.
 */
const token = process.env.BLOB_READ_WRITE_TOKEN || undefined

const keyFor = (collectionPrefix: string, filename: string, docPrefix?: string) =>
  getFileKey({ collectionPrefix, docPrefix, filename, useCompositePrefixes: false }).fileKey

/** CDN URL for a file key; only the basename is URL-encoded (same as the official adapter). */
const urlFor = (key: string) => {
  const dir = path.posix.dirname(key)
  const file = encodeURIComponent(path.posix.basename(key))
  return `${baseUrl}/${dir === '.' ? file : `${dir}/${file}`}`
}

const adapter: Adapter = ({ prefix = '' }) => ({
  name: 'vercel-blob-oidc',
  generateURL: ({ filename, prefix: docPrefix }) => urlFor(keyFor(prefix, filename, docPrefix)),
  handleUpload: async ({ data, file }) => {
    await put(keyFor(prefix, file.filename, data.prefix), file.buffer, {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60 * 60 * 24 * 365,
      contentType: file.mimeType,
      token,
    })
    return data
  },
  handleDelete: async ({ doc, filename }) => {
    await del(urlFor(keyFor(prefix, filename, doc.prefix)), { token })
  },
  staticHandler: (_req, { params: { filename, prefix: docPrefix } }) =>
    Response.redirect(urlFor(keyFor(prefix, filename, docPrefix)), 302),
})

export const blobStorage =
  (collections: UploadCollectionSlug[]): Plugin =>
  (config) => {
    if (!storeId) return config
    return cloudStoragePlugin({
      collections: Object.fromEntries(collections.map((slug) => [slug, { adapter, disablePayloadAccessControl: true }])),
    })({
      ...config,
      collections: config.collections?.map((c) =>
        collections.includes(c.slug as UploadCollectionSlug)
          ? { ...c, upload: { ...(typeof c.upload === 'object' ? c.upload : {}), disableLocalStorage: true } }
          : c,
      ),
    })
  }
