'use client'

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import { getAddress, type Address } from 'viem'

import { explorer } from '@/lib/explorer'
import { shortAddress } from '@/lib/format'
import {
  NFD_ADDRESS,
  PAUSED_SENTENCE,
  STALE_MS,
  ZERO,
  capAdvice,
  classifyAmount,
  forwardCap,
  describeFlow,
  flowReducer,
  formatAmount,
  formatAmountExact,
  formatAmountGrouped,
  initialFlow,
  isInFlight,
  maxAmount,
  needsApproval,
  parseAmount,
  sameAddress,
  tokenIn,
  tokenOut,
  type Direction,
} from '@/lib/migration'

import { RevokeButton, type RevokePhase } from './RevokeButton'
import { TxLog } from './TxLog'
import { WalletPicker } from './WalletPicker'
import { continueFlow, startFlow, type FlowDeps } from './runFlow'
import { Heading, Panel } from './ui'
import { useMigrationReads, type Config, type Reads } from './useMigrationReads'
import { useNow } from './useNow'
import { useWallet } from './useWallet'

/**
 * The working half of /migrate: capacities, wallet, the form, the log.
 *
 * Three machines, composed here and nowhere else:
 *
 *   PAGE    derived from the reads — checking, unreachable, misconfigured,
 *           read-only. Only read-only ever shows a wallet control. A
 *           verification row that fails on any later poll pulls the page
 *           back out of read-only and aborts whatever was in flight.
 *   WALLET  useWallet — none, connecting, connected; plus "wrong chain",
 *           which still shows balances (they come from the public client)
 *           but turns the action button into a network switch.
 *   FLOW    lib/migration.mjs's reducer, fed by runFlow.ts. The form is
 *           locked from the first click until the flow settles, so the
 *           snapshot the reducer took is the only thing that can be signed.
 *
 * Addresses arrive as strings from the server component and are checksummed
 * here with viem's `getAddress`; a mixed-case value that fails its checksum
 * is a configuration problem, and the page says so rather than guessing.
 *
 * This wallet is not the nav's CONNECT button. That one signs a message to
 * log in to the CMS through wagmi; this one signs transactions through its
 * own EIP-6963 store, so nothing about admin sign-in can change what gets
 * signed here.
 */

const SIGNING_STEPS = new Set(['checking', 'approve-sign', 'send-sign'])

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function balanceText(value: bigint | null, unit: string) {
  if (value === null) return { text: '—', title: undefined }
  const shown = formatAmount(value)
  const mark = shown.lossy && !shown.text.startsWith('<') ? '≈' : ''
  return { text: `${mark}${shown.text} ${unit}`, title: `${formatAmountGrouped(value)} ${unit}` }
}

export function MigrationTerminal({ hook, bic }: { hook: string; bic: string }) {
  const config = useMemo<Config | null>(() => {
    try {
      return { hook: getAddress(hook), bic: getAddress(bic) }
    } catch {
      return null
    }
  }, [hook, bic])

  const [flow, dispatch] = useReducer(flowReducer, undefined, initialFlow)
  const flowRef = useRef(flow)
  // Synchronous in the commit, so an awaited step resuming right after a
  // dispatch sees the flow it is about to act on, not the one before.
  useLayoutEffect(() => {
    flowRef.current = flow
  }, [flow])

  // Wallets fire accountsChanged on reconnects too, with the same account; only
  // a different signer stops a flow. A network change matters only before
  // anything is sent. A read pulls a flow only while a prompt could be open,
  // and only when the contract positively fails a check — an unreachable node
  // is the re-check's business (it reports "nothing was sent" itself).
  const onAccountChanged = useCallback((account: Address | null) => {
    const f = flowRef.current
    if (!isInFlight(f.step) || sameAddress(account, f.account)) return
    dispatch({ type: 'ABORT' })
  }, [])
  const onChainChanged = useCallback(() => {
    if (SIGNING_STEPS.has(flowRef.current.step)) dispatch({ type: 'ABORT' })
  }, [])
  const wallet = useWallet({ onAccountChanged, onChainChanged })

  const onReads = useCallback((r: Reads) => {
    const step = flowRef.current.step
    if (step !== 'approve-sign' && step !== 'send-sign') return
    if (r.status === 'inconsistent' || (r.status === 'ok' && !r.verification.ok))
      dispatch({ type: 'ABORT' })
  }, [])
  const { reads, refresh } = useMigrationReads(config, wallet.account, { onReads })

  const now = useNow()
  const [direction, setDirection] = useState<Direction>('forward')
  const [amountText, setAmountText] = useState('')
  const baseId = useId()
  const inputId = `${baseId}-amount`
  const helpId = `${baseId}-help`
  const pausedId = `${baseId}-paused`
  const logHeading = useRef<HTMLHeadingElement>(null)

  const page: 'checking' | 'unreachable' | 'misconfigured' | 'read-only' = !config
    ? 'misconfigured'
    : reads.status === 'loading'
      ? 'checking'
      : reads.status === 'unreachable'
        ? 'unreachable'
        : reads.status === 'inconsistent' || !reads.verification.ok
          ? 'misconfigured'
          : 'read-only'
  const stale = page === 'read-only' && reads.readAt > 0 && now - reads.readAt > STALE_MS

  const parsed = parseAmount(amountText)
  const amount = parsed.ok ? parsed.value : null
  // Only this wallet's own figures, never a read taken for the previous one.
  const mine =
    reads.account && wallet.account && sameAddress(reads.account.address, wallet.account)
      ? reads.account
      : null
  const balance = mine ? (direction === 'forward' ? mine.nfdBalance : mine.bicBalance) : null
  const allowance = mine ? (direction === 'forward' ? mine.nfdAllowance : mine.bicAllowance) : null
  const [revokePhase, setRevokePhase] = useState<RevokePhase>('idle')
  const revokeBusy = revokePhase === 'signing' || revokePhase === 'pending'
  // Forward is capped by the hook's inventory AND, for an NFD voter, by the
  // vault's votingTokens counter — see forwardCap() in lib/migration.mjs.
  // Reverse draws on the escrow and the counter is not involved.
  const cap = reads.hook
    ? direction === 'forward'
      ? forwardCap({
          inventoryB: reads.hook.inventoryB,
          votingTokens: reads.nfd?.votingTokens ?? null,
          userPrice: mine?.nfdUserPrice ?? null,
        })
      : reads.hook.escrowedA
    : null
  const paused = reads.hook?.paused ?? null
  const classification = classifyAmount({ direction, amount, balance, cap, paused })
  const approvalNeeded = amount !== null && needsApproval(allowance, amount)
  const max = maxAmount({ balance, cap })
  const advice = capAdvice({ direction, amount, cap })
  const inFlight = isInFlight(flow.step)
  const connected = wallet.status === 'connected' && wallet.account !== null
  const wrongChain = connected && !wallet.onMainnet

  const described = describeFlow(flow, {
    direction,
    amount,
    classification,
    needsApproval: approvalNeeded,
  })
  let label = described.label
  let disabled = described.disabled
  if (flow.step === 'idle' || flow.step === 'approved') {
    if (wrongChain) {
      label = 'Switch to Ethereum mainnet'
      disabled = false
    } else if (stale || revokeBusy) {
      label = 'Waiting for Ethereum…'
      disabled = true
    }
  }

  const pending = ['approve-sign', 'approve-pending', 'send-sign', 'send-pending'].includes(
    flow.step,
  )
  useEffect(() => {
    if (!pending) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [pending])

  useEffect(() => {
    if (flow.step === 'mined') logHeading.current?.focus()
  }, [flow.step])

  const buildDeps = (id: string, d: Direction, a: bigint, account: Address): FlowDeps => ({
    id,
    direction: d,
    amount: a,
    account,
    hook: config!.hook,
    bic: config!.bic,
    nfd: NFD_ADDRESS,
    refresh,
    approvedAtBlock: flowRef.current.id === id ? flowRef.current.approvedAtBlock : null,
    getWalletClient: wallet.getWalletClient,
    dispatch,
    isCurrent: () => flowRef.current.id === id && isInFlight(flowRef.current.step),
  })

  async function onAction() {
    if (!config) return
    if (flow.step === 'mined' || flow.step === 'aborted') {
      dispatch({ type: 'RESET' })
      setAmountText('')
      return
    }
    if (flow.step === 'failed') {
      dispatch({ type: 'RESET' })
      void refresh()
      return
    }
    if (!connected || wallet.account === null) return
    if (wrongChain) {
      await wallet.switchToMainnet()
      return
    }
    if (flow.step === 'approved') {
      if (
        flow.id === null ||
        flow.direction === null ||
        flow.amount === null ||
        flow.account === null
      )
        return
      if (!sameAddress(flow.account, wallet.account)) {
        dispatch({ type: 'ABORT' })
        return
      }
      const snapshot = {
        id: flow.id,
        direction: flow.direction,
        amount: flow.amount,
        account: flow.account as Address,
      }
      dispatch({ type: 'START', ...snapshot })
      await continueFlow(
        buildDeps(snapshot.id, snapshot.direction, snapshot.amount, snapshot.account),
      )
      return
    }
    if (
      flow.step !== 'idle' ||
      amount === null ||
      classification !== 'ok' ||
      page !== 'read-only' ||
      stale
    )
      return
    const id = newId()
    const account = wallet.account
    dispatch({ type: 'START', id, direction, amount, account })
    await startFlow(buildDeps(id, direction, amount, account))
  }

  const help = (() => {
    if (!parsed.ok) {
      if (parsed.reason === 'invalid')
        return 'Digits and one decimal point only. Commas, spaces and exponents are not accepted.'
      if (parsed.reason === 'too-many-decimals')
        return `${tokenIn(direction)} has 18 decimal places; that number has more. This page will not round for you.`
      if (parsed.reason === 'too-large') return 'That is more than any token can hold.'
      if (parsed.reason === 'zero') return 'Nothing to send.'
      return null
    }
    switch (classification) {
      case 'paused':
        return PAUSED_SENTENCE
      case 'unread':
        return connected ? 'The figures have not been read yet.' : null
      case 'exceeds-balance':
        return `That is more than this account holds: ${balance === null ? '—' : formatAmountGrouped(balance)} ${tokenIn(direction)}.`
      case 'exceeds-cap':
        return advice
      default:
        return null
    }
  })()
  const invalid = !parsed.ok
    ? parsed.reason !== 'empty'
    : classification !== 'ok' && classification !== 'unread'

  const nfdBalance = balanceText(mine?.nfdBalance ?? null, 'NFD')
  const bicBalance = balanceText(mine?.bicBalance ?? null, 'BIC')
  const failedChecks = reads.verification.checks.filter((c) => c.ok === false)
  const inputToken: Address | null = config
    ? direction === 'forward'
      ? NFD_ADDRESS
      : config.bic
    : null

  return (
    <>
      {page === 'read-only' && paused && (
        <Panel tone="notice" role="status" id={pausedId}>
          <p className="mig-p">
            <strong>Forward migration is paused.</strong> {PAUSED_SENTENCE}
          </p>
        </Panel>
      )}

      {page === 'misconfigured' && (
        <Panel tone="notice" role="status">
          <p className="mig-p">
            <strong>These contracts do not check out.</strong> This page is configured with contract
            addresses that fail one or more of its on-chain checks, listed below. Until that is
            fixed it will not ask your wallet for anything. Nothing to do on your side — this is a
            configuration problem on ours.
          </p>
          <ul className="mig-list bulleted tight">
            {!config && (
              <li>A configured address has a mixed-case checksum that does not verify.</li>
            )}
            {reads.status === 'inconsistent' && (
              <li>A capacity exceeds its token&rsquo;s supply.</li>
            )}
            {failedChecks.map((c) => (
              <li key={c.key}>{c.label} — failed</li>
            ))}
          </ul>
        </Panel>
      )}

      {page === 'read-only' && !connected && (
        <Panel>
          <WalletPicker
            wallets={wallet.wallets}
            connecting={wallet.status === 'connecting' ? wallet.rdns : null}
            error={wallet.error}
            onPick={(rdns) => void wallet.connect(rdns)}
          />
        </Panel>
      )}

      <Panel>
        <fieldset disabled={inFlight} className="mig-fieldset">
          <legend className="mig-legend">Direction</legend>
          <div className="mig-seg">
            {(['forward', 'reverse'] as const).map((d) => {
              const id = `${baseId}-dir-${d}`
              return (
                <span key={d} className="mig-seg-item">
                  <input
                    type="radio"
                    id={id}
                    name={`${baseId}-direction`}
                    value={d}
                    checked={direction === d}
                    onChange={() => setDirection(d)}
                    className="mig-sr"
                    aria-describedby={d === 'forward' && paused ? pausedId : undefined}
                  />
                  <label htmlFor={id} className={`mig-seg-option mig-dir-${d}`}>
                    {d === 'forward' ? (
                      <>
                        NFD <span className="mig-arrow">→</span> BIC
                      </>
                    ) : (
                      <>
                        BIC <span className="mig-arrow">→</span> NFD
                      </>
                    )}
                  </label>
                </span>
              )
            })}
          </div>
        </fieldset>

        <p className="mig-note">
          {connected ? (
            <>
              Holds{' '}
              <span className="mig-num" title={nfdBalance.title}>
                {nfdBalance.text}
              </span>{' '}
              ·{' '}
              <span className="mig-num" title={bicBalance.title}>
                {bicBalance.text}
              </span>
            </>
          ) : (
            'Holds — · —'
          )}
        </p>

        <label htmlFor={inputId} className="mig-label">
          {direction === 'forward' ? 'Amount of NFD to migrate' : 'Amount of BIC to redeem'}
        </label>
        <div className="mig-input-row">
          <input
            id={inputId}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            value={amountText}
            disabled={inFlight}
            onChange={(e) => setAmountText(e.target.value)}
            aria-describedby={helpId}
            aria-invalid={invalid || undefined}
            placeholder="0"
            className="mig-input"
          />
          <button
            type="button"
            disabled={inFlight || max === null}
            onClick={() => max && setAmountText(formatAmountExact(max.value))}
            aria-label="Max — use the most this account can send now"
            className="mig-btn"
          >
            Max
          </button>
        </div>
        {max?.cappedBy === 'cap' && balance !== null && cap !== null && (
          <p className="mig-note">
            {`Max is the contract's room, not your balance: ${formatAmountGrouped(cap)} of your ${formatAmountGrouped(balance)} ${tokenIn(direction)}. Send the rest in a second migration.`}
          </p>
        )}
        <p id={helpId} className="mig-help">
          {help}
        </p>

        {/* The two contract addresses, under the field where an amount was just
            typed. Arrows match the direction control: the token going in, then
            the token coming back. A visitor can paste either into a scanner
            without taking this page's word for anything. */}
        {config && (
          <p className="mig-cas">
            <span className="mig-ca">
              <span className={direction === 'forward' ? 'mig-arrow-in' : 'mig-arrow-out'}>
                {direction === 'forward' ? '→' : '←'}
              </span>{' '}
              NFD{' '}
              <a
                href={explorer.token(NFD_ADDRESS)}
                target="_blank"
                rel="noopener noreferrer"
                className="mig-ca-addr"
              >
                {NFD_ADDRESS}
              </a>
            </span>
            <span className="mig-ca">
              <span className={direction === 'forward' ? 'mig-arrow-out' : 'mig-arrow-in'}>
                {direction === 'forward' ? '←' : '→'}
              </span>{' '}
              BIC{' '}
              <a
                href={explorer.token(config.bic)}
                target="_blank"
                rel="noopener noreferrer"
                className="mig-ca-addr"
              >
                {config.bic}
              </a>
            </span>
          </p>
        )}
        {classification === 'exceeds-cap' && cap !== null && cap > ZERO && !inFlight && (
          <button
            type="button"
            onClick={() => setAmountText(formatAmountExact(cap))}
            className="mig-btn mig-self-start"
          >
            {`Use the available ${formatAmountExact(cap)}`}
          </button>
        )}

        {amount !== null && (
          <div className="mig-quote">
            <p className="mig-quote-line">
              You receive exactly{' '}
              <span className="mig-num">{`${formatAmountGrouped(amount)} ${tokenOut(direction)}`}</span>
            </p>
            <p className="mig-note mig-mono">{`${amount.toString()} raw units — the same number the contract moves.`}</p>
            <p className="mig-note">One for one, no fee, no slippage, no price.</p>
          </div>
        )}

        {connected &&
          config &&
          inputToken &&
          flow.step === 'idle' &&
          allowance !== null &&
          (allowance > ZERO || revokePhase !== 'idle') && (
            <RevokeButton
              key={`${inputToken}:${wallet.account}`}
              token={inputToken}
              hook={config.hook}
              account={wallet.account as Address}
              allowance={allowance}
              direction={direction}
              disabled={inFlight || page !== 'read-only' || wrongChain}
              getWalletClient={wallet.getWalletClient}
              refresh={refresh}
              onPhase={setRevokePhase}
            />
          )}

        <div className="mig-actions">
          {page !== 'read-only' ? (
            <button type="button" disabled className="mig-action">
              {page === 'checking' ? 'Reading the contracts…' : 'Not available'}
            </button>
          ) : !connected ? null : (
            <>
              <div className="mig-connected">
                <span className="mig-label">Connected</span>
                <a
                  href={explorer.address(wallet.account as string)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={wallet.account as string}
                  className="mig-link mig-mono"
                >
                  {shortAddress(wallet.account as string)}
                </a>
                <button
                  type="button"
                  onClick={wallet.forget}
                  disabled={inFlight}
                  className="mig-btn-plain"
                >
                  Forget this wallet
                </button>
                <span className="mig-note">
                  This page forgets the wallet. The wallet&rsquo;s own permission for this site
                  stays until you revoke it there.
                </span>
              </div>
              {wrongChain && (
                <p role="status" className="mig-alert">
                  {`This wallet is on chain ${wallet.chainId ?? '?'}. The migration exists on Ethereum mainnet only.`}
                </p>
              )}
              {wallet.error && (
                <p role="alert" className="mig-alert">
                  {wallet.error}
                </p>
              )}
              <button
                type="button"
                onClick={() => void onAction()}
                disabled={disabled}
                aria-busy={pending || flow.step === 'checking'}
                className="mig-action"
              >
                {label}
              </button>
              {flow.step === 'approved' && (
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'DISMISS' })}
                  className="mig-btn-plain mig-self-start"
                >
                  Not now — keep the approval, do not migrate yet
                </button>
              )}
            </>
          )}
          <p className="mig-note">
            This page never asks for a seed phrase, never asks where to send tokens, and never asks
            for more than the amount you typed. Tokens go to the account you connected.
          </p>
        </div>
      </Panel>

      {page === 'read-only' && config && (
        <Panel tone="notice">
          <Heading>Before you sign</Heading>
          <p className="mig-p">
            For one migration, two prompts at most. The first is an approval: your wallet will show
            the spender as <span className="mig-mono">{config.hook}</span> and the amount as exactly
            what you typed — if it shows anything else, reject it. The second is the migration
            itself, sending to the account you connected. If your wallet lets you edit the approval
            amount and you lower it, this page stops and asks again rather than sending a migration
            that would fail. A transaction that fails on chain moves no tokens; it costs gas and
            nothing more.
          </p>
        </Panel>
      )}

      {/* Mounted for the life of the page so the first sentence is announced. */}
      <p aria-live="polite" className="mig-sr">
        {described.status ?? ''}
      </p>

      <TxLog
        ref={logHeading}
        flow={flow}
        status={described.status}
        onDismiss={() => dispatch({ type: 'DISMISS' })}
      />

    </>
  )
}
