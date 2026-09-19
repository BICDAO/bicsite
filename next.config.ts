import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(__filename)

const nextConfig: NextConfig = {
  // The Webflow 301 table, reimplemented. Exported from Site settings -> Publishing on the
  // bic-redesign site on 2026-09-19, before the subscription lapses (it is invisible from outside
  // the account and dies with it). The table had exactly ONE row -- see docs/webflow-redirects.md
  // for the full export and for the 34 template URLs that are deliberately NOT redirected.
  async redirects() {
    return [{ source: '/about', destination: '/provenance', permanent: true }]
  },
  images: {
    localPatterns: [
      {
        pathname: '/api/media/file/**',
      },
    ],
    // Media served straight from the Vercel Blob CDN (see src/lib/blobStorage.ts)
    remotePatterns: [{ protocol: 'https', hostname: '*.public.blob.vercel-storage.com' }],
  },
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
  turbopack: {
    root: path.resolve(dirname),
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
