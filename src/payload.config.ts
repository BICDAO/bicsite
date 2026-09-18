import { postgresAdapter } from '@payloadcms/db-postgres'
import { resendAdapter } from '@payloadcms/email-resend'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
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
import { blobStorage } from './lib/blobStorage'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

/**
 * Transactional email (password resets). Without it Payload falls back to an adapter that logs the
 * subject and throws the message away — so "Forgot password" reports success and sends nothing.
 *
 * Undefined when RESEND_API_KEY is unset, which keeps local development and CI working with no
 * credentials and no network. The sending domain is mail.bureauofinternetculture.art: a subdomain,
 * so its SPF and DKIM never touch the records the apex depends on.
 */
const email = process.env.RESEND_API_KEY
  ? resendAdapter({
      apiKey: process.env.RESEND_API_KEY,
      defaultFromAddress: process.env.EMAIL_FROM || 'noreply@mail.bureauofinternetculture.art',
      defaultFromName: process.env.EMAIL_FROM_NAME || 'Bureau of Internet Culture',
    })
  : undefined

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
  email,
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
  plugins: [blobStorage(['media'])],
})
