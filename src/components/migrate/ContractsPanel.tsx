'use client'

import { COMMUNITY_MULTISIG, NFD_ADDRESS, POOL_MANAGER, sameAddress } from '@/lib/migration'

import { AddressRow, Heading, Panel } from './ui'
import type { Reads } from './useMigrationReads'

/**
 * Every address the page talks to, and the thirteen things it checked. The
 * checklist is the page showing its work: a visitor can compare each row
 * against Etherscan without trusting this site for any of it.
 */
export function ContractsPanel({
  hook,
  bic,
  reads,
  now,
}: {
  hook: string
  bic: string
  reads: Reads
  now: number
}) {
  const age = reads.readAt ? Math.max(0, Math.round((now - reads.readAt) / 1000)) : null
  // The owner row shows what the contract answered, not what we expect of it:
  // a failed owner check on the same panel must not sit under a row that
  // calls the multisig the owner.
  const owner = reads.hook?.owner ?? null
  const ownerIsMultisig = owner === null || sameAddress(owner, COMMUNITY_MULTISIG)
  return (
    <Panel>
      <Heading>The contracts</Heading>
      <div className="mig-rows">
        <AddressRow label="NFD" note="Feisty Doge, Ethereum mainnet" address={NFD_ADDRESS} />
        <AddressRow label="BIC" note="Bureau of Internet Culture" address={bic} />
        <AddressRow
          label="Migration contract"
          note="Holds the escrow and the inventory"
          address={hook}
        />
        <AddressRow
          label="Owner"
          note={
            ownerIsMultisig
              ? 'Community multisig'
              : 'As read from the contract — not the community multisig'
          }
          address={owner ?? COMMUNITY_MULTISIG}
        />
        <AddressRow
          label="Uniswap v4 PoolManager"
          note="Where the tokens physically sit"
          address={POOL_MANAGER}
        />
      </div>
      <h3 className="mig-h3">What this page checked</h3>
      <ul className="mig-rows">
        {reads.verification.checks.map((c) => (
          <li key={c.key} className={`mig-check${c.ok === false ? ' failed' : ''}`}>
            <span className="mig-check-state">
              {c.ok === null ? '—' : c.ok ? 'checked' : 'failed'}
            </span>
            <span>{c.label}</span>
          </li>
        ))}
      </ul>
      <p className="mig-note">
        {reads.status === 'unreachable'
          ? 'Could not reach Ethereum to check.'
          : age === null
            ? 'Not yet checked against Ethereum.'
            : `Checked against Ethereum ${age}s ago.`}
      </p>
    </Panel>
  )
}
