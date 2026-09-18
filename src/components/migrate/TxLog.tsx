'use client'

import { forwardRef } from 'react'

import { explorer } from '@/lib/explorer'
import { formatAmountExact, tokenIn, type Flow } from '@/lib/migration'

import { Panel } from './ui'

/**
 * One migration, as it happens: the approval step, the migration step, each
 * hash with its Etherscan link, and the sentence the reducer's snapshot says
 * is true right now. The state word is always printed — never colour alone,
 * which on a monochrome site would be no signal at all.
 */

function short(hash: string) {
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`
}

function failureWord(flow: Flow): string {
  switch (flow.failure?.kind) {
    case 'rejected':
      return 'Declined'
    case 'cancelled':
      return 'Cancelled'
    case 'replaced':
      return 'Replaced'
    case 'reverted':
      return 'Reverted'
    default:
      return 'Failed'
  }
}

/** The state word for a step. Always printed; never colour alone. */
function stepWord(flow: Flow, which: 'approve' | 'send'): string {
  const { step } = flow
  const from = flow.failure?.from
  const failedApprove =
    step === 'failed' &&
    (from === 'approve-sign' ||
      from === 'approve-pending' ||
      (from === 'stalled' && flow.stalledFrom === 'approve'))
  const failedSend =
    step === 'failed' &&
    (from === 'send-sign' ||
      from === 'send-pending' ||
      (from === 'stalled' && flow.stalledFrom === 'send'))
  if (which === 'approve') {
    if (failedApprove) return failureWord(flow)
    if (step === 'approve-sign') return 'Signing'
    if (step === 'approve-pending' || (step === 'stalled' && flow.stalledFrom === 'approve'))
      return 'Pending'
    if (flow.approveMined) return 'Mined'
    if (flow.approveHash !== null) return 'Sent'
    if (step === 'checking' || (step === 'failed' && from === 'checking') || step === 'aborted')
      return ''
    return 'Not needed'
  }
  if (failedSend) return failureWord(flow)
  if (step === 'send-sign') return 'Signing'
  if (step === 'send-pending' || (step === 'stalled' && flow.stalledFrom === 'send'))
    return 'Pending'
  if (step === 'mined') return 'Mined'
  if (flow.sendHash !== null) return 'Sent'
  return ''
}

function HashLink({ hash }: { hash: string }) {
  return (
    <a
      href={explorer.tx(hash)}
      target="_blank"
      rel="noopener noreferrer"
      className="mig-link mig-mono"
      title={hash}
    >
      {short(hash)} · {explorer.name} ↗
    </a>
  )
}

export const TxLog = forwardRef<
  HTMLHeadingElement,
  { flow: Flow; status: string | null; onDismiss?: () => void }
>(function TxLog({ flow, status, onDismiss }, ref) {
  if (flow.step === 'idle' || flow.direction === null || flow.amount === null) return null
  const dir = flow.direction
  const amount = formatAmountExact(flow.amount)
  const rows = [
    {
      n: 1,
      label: `Approve ${amount} ${tokenIn(dir)}`,
      word: stepWord(flow, 'approve'),
      hash: flow.approveHash,
    },
    {
      n: 2,
      label: dir === 'forward' ? `Migrate ${amount} NFD to BIC` : `Redeem ${amount} BIC for NFD`,
      word: stepWord(flow, 'send'),
      hash: flow.sendHash,
    },
  ]
  const failed = flow.step === 'failed'

  return (
    <Panel>
      <h2 ref={ref} tabIndex={-1} className="mig-h2">
        This migration
      </h2>
      <ol className="mig-steps">
        {rows.map((r) => (
          <li key={r.n} className="mig-step">
            <span className="mig-step-n">{r.n}</span>
            <span className="mig-step-label">{r.label}</span>
            {r.word && <span className="mig-step-word">{r.word}</span>}
            {r.hash && <HashLink hash={r.hash} />}
          </li>
        ))}
      </ol>
      {flow.replaced.length > 0 && (
        <p className="mig-note mig-mono">
          {flow.replaced.map((r) => `${r.reason} → ${short(r.to)}`).join(' · ')}
        </p>
      )}
      {/* The live region that announces this sentence is mounted permanently
          in MigrationTerminal; a region created together with its first
          message is not announced. */}
      {status &&
        (failed ? (
          <p role="alert" className="mig-alert">
            {status}
          </p>
        ) : (
          <p className="mig-p">{status}</p>
        ))}
      {flow.step === 'stalled' && onDismiss && (
        <button type="button" onClick={onDismiss} className="mig-btn-plain mig-self-start">
          Dismiss and start another
        </button>
      )}
    </Panel>
  )
})
