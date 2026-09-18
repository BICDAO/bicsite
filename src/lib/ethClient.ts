import { createPublicClient, fallback, http } from 'viem'
import { mainnet } from 'viem/chains'

import { PUBLIC_RPCS } from './migration'

/**
 * The read-only Ethereum client the migration page uses in the browser.
 *
 * Reads never go through the wallet. A wallet's own node is whatever the
 * wallet chose, may be on the wrong chain, and is absent for the visitor who
 * has no wallet — and the capacities are meant to be visible to anyone. So the
 * page reads through public mainnet nodes, in order, falling through on
 * failure. `rank: false` keeps that order fixed: the one from configuration
 * first, then the public list from lib/migration.mjs.
 *
 * This is deliberately NOT wagmi. `lib/wagmi.ts` exists for the nav's wallet
 * sign-in, which is a different job with a different failure mode; the
 * migration reads and writes through its own client so that a change to
 * sign-in configuration can never alter what this page shows or sends.
 *
 * NEXT_PUBLIC_ETH_RPC is optional. Set it to a domain-allowlisted endpoint if
 * the public nodes rate-limit; leave it unset in development, where a key
 * allowlisted to production would refuse localhost anyway.
 *
 * A module-level singleton on purpose: a client created inside a component
 * would be a new object every render, and every effect keyed on it would run
 * again.
 */
const configured = process.env.NEXT_PUBLIC_ETH_RPC

const urls = [configured, ...PUBLIC_RPCS].filter((u): u is string => !!u && u.trim() !== '')

export const publicClient = createPublicClient({
  chain: mainnet,
  transport: fallback(
    urls.map((url) => http(url, { timeout: 8_000, retryCount: 1 })),
    { rank: false },
  ),
})

export type PublicClient = typeof publicClient
