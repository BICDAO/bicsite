'use client'

import { formatAmount, formatAmountGrouped } from '@/lib/migration'

import { Panel, Stat } from './ui'
import type { Reads } from './useMigrationReads'

/**
 * The two live capacities and the two pause states, readable without a
 * wallet. This is what RUNBOOK §8 asks the page to surface: a forward
 * migration can never exceed the BIC inventory, a reverse one the NFD escrow,
 * and a holder with more than that has to split.
 */

function figure(value: bigint | null, unit: string) {
  if (value === null) return { text: '—', title: undefined }
  const shown = formatAmount(value)
  const mark = shown.lossy && !shown.text.startsWith('<') ? '≈' : ''
  return { text: `${mark}${shown.text} ${unit}`, title: `${formatAmountGrouped(value)} ${unit}` }
}

export function CapsStrip({
  reads,
  now,
  page,
  stale,
}: {
  reads: Reads
  now: number
  page: 'checking' | 'unreachable' | 'misconfigured' | 'read-only'
  stale: boolean
}) {
  const showFigures = page === 'read-only'
  const inventory = figure(showFigures ? (reads.hook?.inventoryB ?? null) : null, 'BIC')
  const escrow = figure(showFigures ? (reads.hook?.escrowedA ?? null) : null, 'NFD')
  const paused = showFigures ? reads.hook?.paused : null
  const age = reads.readAt ? Math.max(0, Math.round((now - reads.readAt) / 1000)) : null
  const loading = page === 'checking' ? 'Loading' : undefined

  return (
    <Panel>
      <div className="mig-stats">
        <Stat
          label="Forward capacity"
          help="BIC the contract can pay out in one transaction"
          value={inventory.text}
          title={inventory.title}
          srOnly={loading}
        />
        <Stat
          label="Reverse capacity"
          help="NFD in escrow, redeemable now"
          value={escrow.text}
          title={escrow.title}
          srOnly={loading}
        />
        <Stat
          label="Forward migration"
          help="NFD → BIC"
          value={paused === null || paused === undefined ? '—' : paused ? 'Paused' : 'Open'}
          srOnly={loading}
        />
        <Stat label="Reverse migration" help="BIC → NFD" value="Cannot be paused" />
      </div>
      <p className="mig-note">
        {page === 'read-only' && reads.block !== null && age !== null && (
          <>
            {`Read at block ${reads.block.toString()}, ${age}s ago.`}
            {reads.stale && ' The node used for this read may be behind.'}
            {stale && ' The numbers are stale — retrying.'}
          </>
        )}
        {page === 'checking' && 'Reading the contracts…'}
        {page === 'unreachable' &&
          'Could not reach Ethereum through any public node. Nothing is known to be wrong with the contract; this page simply cannot see it right now.'}
        {page === 'misconfigured' && 'Not read — see the checks below.'}
      </p>
    </Panel>
  )
}
