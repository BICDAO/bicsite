import { KNOWN_BIC, KNOWN_HOOK, readConfig, type Config } from './migration'

/**
 * The migration's configuration, read once per build.
 *
 * Every `process.env.NEXT_PUBLIC_*` here is a literal member expression on
 * purpose: that is the only form Next inlines into the browser bundle, and
 * the values are frozen at `next build` — changing one in Vercel does nothing
 * until the next deploy. VERCEL_ENV is not public and only matters on the
 * server, which is where this is called from (server components only; the
 * terminal receives the two addresses as props).
 *
 * The rules — both or neither, production ignores env and needs the pin, the
 * kill switch works everywhere — live in `readConfig` in lib/migration.mjs
 * and are tested there. This file only supplies the inputs.
 */
export function migrationConfig(): Config {
  return readConfig({
    hook: process.env.NEXT_PUBLIC_MIGRATOR_HOOK,
    bic: process.env.NEXT_PUBLIC_BIC_TOKEN,
    disabled: process.env.NEXT_PUBLIC_MIGRATION_DISABLED,
    vercelEnv: process.env.VERCEL_ENV,
    knownHook: KNOWN_HOOK,
    knownBic: KNOWN_BIC,
  })
}
