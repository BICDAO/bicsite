'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Address, Hex } from 'viem'
import { publicClient } from '@/lib/ethClient'
import { BIC_ABI, ERC20_ABI, MIGRATOR_ABI } from '@/lib/migrationAbi'
import {
  NFD_ADDRESS,
  POLL_MS,
  isConsistent,
  verifyDeployment,
  type Verification,
} from '@/lib/migration'

/**
 * Everything the page knows about the chain, read through public nodes.
 *
 * One poll is one block number and then one multicall pinned to that block,
 * so every figure on the page — both capacities, the paused flag, the
 * verification rows, a connected account's balances and allowances — comes
 * from the same moment, and "read at block N" is true of all of them. Reads
 * never touch the wallet: a visitor with no wallet sees the same capacities as
 * one with.
 *
 * `status` is the one thing the components branch on:
 *
 *   loading       first read in flight; render dashes
 *   unreachable   no public node answered; render dashes and say so — nothing
 *                 is known to be wrong with the contract
 *   inconsistent  a capacity exceeds its token's supply; a wrong contract or a
 *                 wrong node, and either way not a number to show
 *   ok            everything below is from block `block`
 *
 * `verification` is computed on every poll, not once: a check that later
 * fails (an ownership handover, a node on the wrong chain) must pull the page
 * back to read-only mid-session, and the write flow re-reads before it asks a
 * wallet for anything.
 */

export type HookReads = {
  paused: boolean | null
  inventoryB: bigint | null
  escrowedA: bigint | null
  tokenA: Address | null
  tokenB: Address | null
  owner: Address | null
  poolManager: Address | null
}

export type TokenReads = {
  symbol: string | null
  decimals: number | null
  totalSupply: bigint | null
}

export type AccountReads = {
  address: Address
  nfdBalance: bigint | null
  bicBalance: bigint | null
  nfdAllowance: bigint | null
  bicAllowance: bigint | null
}

export type Reads = {
  status: 'loading' | 'ok' | 'unreachable' | 'inconsistent'
  block: bigint | null
  /** Wall-clock time of the read, for "12s ago". 0 before the first read. */
  readAt: number
  /** True when a node lagged behind a receipt's block and the read is unpinned. */
  stale: boolean
  hook: HookReads | null
  bic: (TokenReads & { treasury: Address | null }) | null
  nfd: TokenReads | null
  account: AccountReads | null
  verification: Verification
}

export type Config = { hook: Address; bic: Address }

const INITIAL: Reads = {
  status: 'loading',
  block: null,
  readAt: 0,
  stale: false,
  hook: null,
  bic: null,
  nfd: null,
  account: null,
  verification: verifyDeployment({}, {}),
}

// Per-page-load caches for the two things that never change: which chain the
// nodes are on, and whether the configured addresses hold code.
let chainIdPromise: Promise<number> | null = null
const codeCache = new Map<Address, Hex>()

function chainId(): Promise<number> {
  if (!chainIdPromise) {
    chainIdPromise = publicClient.getChainId().catch((err) => {
      chainIdPromise = null // never cache a failure
      throw err
    })
  }
  return chainIdPromise
}

async function code(address: Address): Promise<Hex> {
  const hit = codeCache.get(address)
  if (hit) return hit
  const value = (await publicClient.getCode({ address })) ?? '0x'
  codeCache.set(address, value)
  return value
}

function ok<T>(
  entry: { status: 'success'; result: T } | { status: 'failure'; error: Error },
): T | null {
  return entry.status === 'success' ? entry.result : null
}

const MIN_BLOCK_TRIES = 8
const MIN_BLOCK_DELAY_MS = 2_000

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function load(config: Config, account: Address | null, minBlock?: bigint): Promise<Reads> {
  const readAt = Date.now()
  let rpcChainId: number | null = null
  let hookCode: Hex | null = null
  let bicCode: Hex | null = null
  let block: bigint
  let stale = false

  try {
    rpcChainId = await chainId()
    ;[hookCode, bicCode] = await Promise.all([code(config.hook), code(config.bic)])
    block = await publicClient.getBlockNumber({ cacheTime: 0 })
    // Read-your-writes: a public node behind the fallback can lag the block a
    // receipt came from. Wait for it a few times; if it never arrives, read
    // unpinned and say so.
    if (minBlock !== undefined) {
      let tries = 0
      while (block < minBlock && tries < MIN_BLOCK_TRIES) {
        tries += 1
        await sleep(MIN_BLOCK_DELAY_MS)
        block = await publicClient.getBlockNumber({ cacheTime: 0 })
      }
      if (block < minBlock) stale = true
    }
  } catch {
    return { ...INITIAL, status: 'unreachable', readAt }
  }

  const pin = stale ? {} : { blockNumber: block }

  try {
    const [base, mine] = await Promise.all([
      publicClient.multicall({
        allowFailure: true,
        ...pin,
        contracts: [
          { address: config.hook, abi: MIGRATOR_ABI, functionName: 'tokenA' },
          { address: config.hook, abi: MIGRATOR_ABI, functionName: 'tokenB' },
          { address: config.hook, abi: MIGRATOR_ABI, functionName: 'paused' },
          { address: config.hook, abi: MIGRATOR_ABI, functionName: 'inventoryB' },
          { address: config.hook, abi: MIGRATOR_ABI, functionName: 'escrowedA' },
          { address: config.hook, abi: MIGRATOR_ABI, functionName: 'owner' },
          { address: config.hook, abi: MIGRATOR_ABI, functionName: 'poolManager' },
          { address: config.bic, abi: BIC_ABI, functionName: 'symbol' },
          { address: config.bic, abi: BIC_ABI, functionName: 'decimals' },
          { address: config.bic, abi: BIC_ABI, functionName: 'totalSupply' },
          { address: config.bic, abi: BIC_ABI, functionName: 'treasury' },
          { address: NFD_ADDRESS, abi: ERC20_ABI, functionName: 'symbol' },
          { address: NFD_ADDRESS, abi: ERC20_ABI, functionName: 'decimals' },
          { address: NFD_ADDRESS, abi: ERC20_ABI, functionName: 'totalSupply' },
        ] as const,
      }),
      account
        ? publicClient.multicall({
            allowFailure: true,
            ...pin,
            contracts: [
              { address: NFD_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf', args: [account] },
              { address: config.bic, abi: ERC20_ABI, functionName: 'balanceOf', args: [account] },
              {
                address: NFD_ADDRESS,
                abi: ERC20_ABI,
                functionName: 'allowance',
                args: [account, config.hook],
              },
              {
                address: config.bic,
                abi: ERC20_ABI,
                functionName: 'allowance',
                args: [account, config.hook],
              },
            ] as const,
          })
        : Promise.resolve(null),
    ])

    // viem answers a chunk-level transport failure as a failure entry per
    // call when allowFailure is set. Fourteen failures at once is a node that
    // could not be reached, not fourteen wrong contracts.
    if (base.every((entry) => entry.status === 'failure')) {
      return { ...INITIAL, status: 'unreachable', readAt }
    }

    const hook: HookReads = {
      tokenA: ok(base[0]),
      tokenB: ok(base[1]),
      paused: ok(base[2]),
      inventoryB: ok(base[3]),
      escrowedA: ok(base[4]),
      owner: ok(base[5]),
      poolManager: ok(base[6]),
    }
    const bic = {
      symbol: ok(base[7]),
      decimals: ok(base[8]),
      totalSupply: ok(base[9]),
      treasury: ok(base[10]),
    }
    const nfd = {
      symbol: ok(base[11]),
      decimals: ok(base[12]),
      totalSupply: ok(base[13]),
    }
    const accountReads: AccountReads | null =
      account && mine
        ? {
            address: account,
            nfdBalance: ok(mine[0]),
            bicBalance: ok(mine[1]),
            nfdAllowance: ok(mine[2]),
            bicAllowance: ok(mine[3]),
          }
        : null

    const verification = verifyDeployment(
      {
        rpcChainId,
        hookCode,
        bicCode,
        tokenA: hook.tokenA,
        tokenB: hook.tokenB,
        owner: hook.owner,
        poolManager: hook.poolManager,
        bicSymbol: bic.symbol,
        bicDecimals: bic.decimals,
        bicTotalSupply: bic.totalSupply,
        bicTreasury: bic.treasury,
        nfdSymbol: nfd.symbol,
        nfdDecimals: nfd.decimals,
      },
      { bic: config.bic },
    )

    const consistent = isConsistent({
      inventoryB: hook.inventoryB,
      escrowedA: hook.escrowedA,
      bicTotalSupply: bic.totalSupply,
      nfdTotalSupply: nfd.totalSupply,
    })

    return {
      status: verification.ok && !consistent ? 'inconsistent' : 'ok',
      block,
      readAt,
      stale,
      hook,
      bic,
      nfd,
      account: accountReads,
      verification,
    }
  } catch {
    return { ...INITIAL, status: 'unreachable', readAt }
  }
}

export function useMigrationReads(
  config: Config | null,
  account: Address | null,
  { onReads }: { onReads?: (reads: Reads) => void } = {},
) {
  const [reads, setReads] = useState<Reads>(INITIAL)
  const onReadsRef = useRef(onReads)
  useEffect(() => {
    onReadsRef.current = onReads
  }, [onReads])
  // Out-of-order protection: only the latest request may publish, and only if
  // it was read for the account that is still current.
  const latest = useRef(0)
  const current = useRef<{ config: Config | null; account: Address | null }>({ config, account })
  // The highest block any read has come from. Public nodes behind a fallback
  // do not agree on the head; a read pinned to an older block than the last
  // one would make balances and allowances go backwards on screen.
  const highest = useRef<bigint | null>(null)
  const readsRef = useRef<Reads>(INITIAL)

  // Layout effects run synchronously in the commit, before any awaited read
  // resumes, so a refresh started for the previous account cannot publish
  // under the new one.
  useLayoutEffect(() => {
    current.current = { config, account }
  }, [config, account])

  const refresh = useCallback(async (opts?: { minBlock?: bigint }): Promise<Reads> => {
    const target = current.current
    if (!target.config) return INITIAL
    const id = ++latest.current
    const floor = opts?.minBlock ?? highest.current ?? undefined
    const result = await load(target.config, target.account, floor)
    const still = current.current
    if (
      id !== latest.current ||
      still.config !== target.config ||
      still.account !== target.account
    ) {
      return result
    }
    // A node still behind after the wait: keep what is on screen, say so,
    // and hand callers a read marked stale rather than an older one.
    const behind = result.status === 'ok' && result.stale && readsRef.current.status === 'ok'
    const published = behind ? { ...readsRef.current, stale: true, readAt: result.readAt } : result
    if (
      published.block !== null &&
      (highest.current === null || published.block > highest.current)
    ) {
      highest.current = published.block
    }
    readsRef.current = published
    setReads(published)
    onReadsRef.current?.(published)
    return published
  }, [])

  useEffect(() => {
    if (!config) return
    let cancelled = false
    // The first read always runs — a page opened in a background tab must not
    // sit on dashes until it is looked at. Only the periodic polls are gated
    // on visibility, and a tab becoming visible reads at once.
    const run = (force = false) => {
      if (cancelled) return
      if (!force && typeof document !== 'undefined' && document.visibilityState !== 'visible')
        return
      void refresh()
    }
    run(true)
    const id = window.setInterval(() => run(), POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') run()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      cancelled = true
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [config, account, refresh])

  return { reads, refresh }
}
