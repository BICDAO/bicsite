import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { vercelBlobStorage } from '@payloadcms/storage-vercel-blob'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { LiquidAssets } from './collections/LiquidAssets'
import { Media } from './collections/Media'
import { Memes } from './collections/Memes'
import { Users } from './collections/Users'
import { Wallets } from './collections/Wallets'
import { Home } from './globals/Home'
import { Provenance } from './globals/Provenance'
import { Site } from './globals/Site'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Memes, LiquidAssets, Media, Users, Wallets],
  globals: [Home, Provenance, Site],
  editor: lexicalEditor(),
  graphQL: { disable: true },
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      // Prisma Postgres: pooled URL at runtime; `pnpm run ci` swaps in DIRECT_URL for migrations.
      connectionString: process.env.DATABASE_URL || '',
    },
    // Schema changes only via committed migrations — never auto-push.
    push: false,
  }),
  sharp,
  plugins: [
    vercelBlobStorage({
      enabled: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      collections: { media: true },
      token: process.env.BLOB_READ_WRITE_TOKEN,
      clientUploads: true,
    }),
  ],
})
