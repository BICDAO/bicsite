'use client'

import { useState } from 'react'
import type { Address, WalletClient } from 'viem'

import { explorer } from '@/lib/explorer'
import { publicClient } from '@/lib/ethClient'
import { ZERO, formatAmountExact, tokenIn, type Direction } from '@/lib/migration'
import { ERC20_ABI } from '@/lib/migrationAbi'

import { explainError } from './errors'
import type { Reads } from './useMigrationReads'

/**
 * Sets a leftover allowance back to zero. Same path as everything else —
 * simulate, sign, wait — but its own small state, because it is not a
 * migration and must not look like one in the log.
 *
 * What it reports is the allowance read back after the receipt, never the
 * receipt alone: a wallet's "cancel" mines a replacement whose receipt is a
 * success, and the allowance is then exactly what it was.
 */
export type RevokePhase = 'idle' | 'signing' | 'pending' | 'done' | 'failed'

export function RevokeButton({
  token,
  hook,
  account,
  allowance,
  direction,
  disabled,
  getWalletClient,
  refresh,
  onPhase,
}: {
  token: Address
  hook: Address
  account: Address
  allowance: bigint
  direction: Direction
  disabled: boolean
  getWalletClient: () => WalletClient | null
  refresh: (opts?: { minBlock?: bigint }) => Promise<Reads>
  /** Lets the form lock its own action button while a revoke is in flight. */
  onPhase: (phase: RevokePhase) => void
}) {
  const [state, setState] = useState<{
    phase: RevokePhase
    message: string | null
    hash: string | null
  }>({
    phase: 'idle',
    message: null,
    hash: null,
  })

  function set(next: { phase: RevokePhase; message: string | null; hash: string | null }) {
    setState(next)
    onPhase(next.phase)
  }

  async function revoke() {
    const wallet = getWalletClient()
    if (!wallet) return
    set({
      phase: 'signing',
      message: 'Confirm setting the allowance to 0 in your wallet.',
      hash: null,
    })
    try {
      const { request } = await publicClient.simulateContract({
        address: token,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [hook, BigInt(0)],
        account,
      })
      const hash = await wallet.writeContract(request)
      set({ phase: 'pending', message: 'Sent. Waiting for Ethereum.', hash })
      let gone = false
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        pollingInterval: 4_000,
        timeout: 0,
        onReplaced: ({ reason }) => {
          if (reason !== 'repriced') gone = true
        },
      })
      const after = await refresh({ minBlock: receipt.blockNumber })
      const now =
        after.account &&
        (direction === 'forward' ? after.account.nfdAllowance : after.account.bicAllowance)
      const cleared = typeof now === 'bigint' && now === ZERO
      set({
        phase: cleared ? 'done' : 'failed',
        message: cleared
          ? 'Allowance set to 0.'
          : gone
            ? 'The revoke was replaced or cancelled in your wallet; the allowance is unchanged.'
            : `The allowance is still ${typeof now === 'bigint' ? formatAmountExact(now) : 'unread'}.`,
        hash: receipt.transactionHash,
      })
    } catch (err) {
      set({ phase: 'failed', message: explainError(err, direction).message, hash: null })
    }
  }

  const busy = state.phase === 'signing' || state.phase === 'pending'

  return (
    <div className="mig-revoke">
      {allowance > ZERO && (
        <p className="mig-note">
          {`This account has already allowed the contract to take ${formatAmountExact(allowance)} ${tokenIn(direction)}. An amount up to that needs no new approval.`}
        </p>
      )}
      <div className="mig-revoke-row">
        {allowance > ZERO && (
          <button
            type="button"
            onClick={revoke}
            disabled={disabled || busy}
            aria-busy={busy}
            className="mig-btn"
          >
            {busy ? 'Revoking…' : 'Revoke'}
          </button>
        )}
        <span role={state.phase === 'failed' ? 'alert' : 'status'} className="mig-note">
          {state.message}
        </span>
        {state.hash && (
          <a
            href={explorer.tx(state.hash)}
            target="_blank"
            rel="noopener noreferrer"
            className="mig-link mig-mono"
          >
            {explorer.name} ↗
          </a>
        )}
      </div>
    </div>
  )
}
