import {
  WaitForTransactionReceiptTimeoutError,
  parseEventLogs,
  type Address,
  type Hash,
  type WalletClient,
} from 'viem'
import { publicClient } from '@/lib/ethClient'
import { ERC20_ABI, MIGRATOR_ABI } from '@/lib/migrationAbi'
import {
  PENDING_RELEASE_MS,
  ZERO,
  capAdvice,
  classifyAmount,
  describeEventMismatch,
  describeReceipt,
  describeRevert,
  formatAmountExact,
  planSteps,
  sameAddress,
  tokenIn,
  type Direction,
  type FlowEvent,
} from '@/lib/migration'
import { explainError } from './errors'
import type { Reads } from './useMigrationReads'

/**
 * The write flow: click → re-check → (approve →) migrate → event-verified.
 *
 * Everything here happens AFTER the reducer took a START snapshot, and every
 * event dispatched carries the flow's id, so a late promise from a flow the
 * user abandoned cannot land on a new one. The rules that matter:
 *
 *  - Re-read before asking. Whatever the page showed a minute ago, the
 *    balance, the capacity and the paused flag are read again, pinned to one
 *    block, and the amount is re-classified before any prompt opens. Nothing
 *    is sent on the strength of a stale screen.
 *  - Exact approvals. `approve` and `migrate` receive the same bigint. After
 *    the approval mines the allowance is read back, because MetaMask lets a
 *    user edit the amount in the prompt; less than asked stops here with an
 *    explanation rather than sending a migration that would fail.
 *  - Simulate, then sign. `simulateContract` on the public node decodes a
 *    revert into a named error before the wallet ever opens.
 *  - The recipient is always the connected account. The simulated request's
 *    `to` is asserted against it — a page bug here would otherwise be a way to
 *    redirect tokens, and that is not a class of bug to trust a code review
 *    alone with.
 *  - Trust the receipt, not the request. Success is the hook's own Migrated /
 *    Unmigrated event, decoded from the mined receipt, with the amount and
 *    recipient the contract says it moved.
 *  - A replacement is followed, a cancellation is a failure, a timeout is not
 *    a failure: after ten minutes the step is released to "stalled" while the
 *    receipt is still watched, and a late receipt still lands.
 */

export type FlowDeps = {
  id: string
  direction: Direction
  amount: bigint
  account: Address
  hook: Address
  bic: Address
  nfd: Address
  refresh: (opts?: { minBlock?: bigint }) => Promise<Reads>
  /** Block the approval mined in, for the second click's re-read. */
  approvedAtBlock?: bigint | null
  getWalletClient: () => WalletClient | null
  dispatch: (event: FlowEvent) => void
  /** False once the reducer has moved on (abort, reset); stops the flow quietly. */
  isCurrent: () => boolean
}

type Receipt = Awaited<ReturnType<typeof publicClient.waitForTransactionReceipt>>

const RETRY_MS = 8_000

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Waits for a receipt, following speed-ups, releasing after the timeout.
 *
 * Never gives up. A transaction with a hash is on chain whatever the page's
 * node is doing: a node hiccup is retried, and after PENDING_RELEASE_MS the
 * step is released to "stalled" (still watched, with `timeout: 0` so viem
 * builds no second deadline — its default is three minutes). The one thing
 * this must never do is turn a live transaction into a failure the user can
 * "try again" on top of.
 */
async function waitFor(
  hash: Hash,
  onRepriced: (hash: Hash) => void,
  onGone: (reason: 'replaced' | 'cancelled', hash: Hash) => void,
  onRelease: () => void,
): Promise<Receipt> {
  const onReplaced = ({
    reason,
    transaction,
  }: {
    reason: 'replaced' | 'repriced' | 'cancelled'
    transaction: { hash: Hash }
  }) => {
    if (reason === 'repriced') onRepriced(transaction.hash)
    else onGone(reason, transaction.hash)
  }
  let released = false
  for (;;) {
    try {
      return await publicClient.waitForTransactionReceipt({
        hash,
        timeout: released ? 0 : PENDING_RELEASE_MS,
        pollingInterval: released ? 8_000 : 4_000,
        onReplaced,
      })
    } catch (err) {
      if (err instanceof WaitForTransactionReceiptTimeoutError) {
        if (!released) {
          released = true
          onRelease()
        }
        continue
      }
      // Transient node trouble. The transaction does not care; keep watching.
      await sleep(RETRY_MS)
    }
  }
}

/** A hash confirmed after the page moved on: log it, watch it, re-read after it. */
function trackLate(deps: FlowDeps, which: 'approve' | 'send', hash: Hash) {
  deps.dispatch({ type: 'LATE_HASH', id: deps.id, which, hash })
  void waitFor(
    hash,
    () => {},
    () => {},
    () => {},
  )
    .then((receipt) => deps.refresh({ minBlock: receipt.blockNumber }))
    .catch(() => {})
}

/** Why a mined transaction reverted, from a simulation one block earlier. */
async function likelyCause(deps: FlowDeps, blockNumber: bigint): Promise<string | null> {
  try {
    await publicClient.simulateContract({
      address: deps.hook,
      abi: MIGRATOR_ABI,
      functionName: deps.direction === 'forward' ? 'migrate' : 'unmigrate',
      args: [deps.amount, deps.account],
      account: deps.account,
      blockNumber: blockNumber > ZERO ? blockNumber - BigInt(1) : blockNumber,
    })
    return null
  } catch (err) {
    const explained = explainError(err, deps.direction)
    return explained.kind.startsWith('revert') ? explained.message : null
  }
}

function inputToken(deps: FlowDeps): Address {
  return deps.direction === 'forward' ? deps.nfd : deps.bic
}

function allowanceOf(reads: Reads, direction: Direction): bigint | null {
  if (!reads.account) return null
  return direction === 'forward' ? reads.account.nfdAllowance : reads.account.bicAllowance
}

function balanceOf(reads: Reads, direction: Direction): bigint | null {
  if (!reads.account) return null
  return direction === 'forward' ? reads.account.nfdBalance : reads.account.bicBalance
}

function capOf(reads: Reads, direction: Direction): bigint | null {
  if (!reads.hook) return null
  return direction === 'forward' ? reads.hook.inventoryB : reads.hook.escrowedA
}

/**
 * Re-reads the chain and re-classifies the snapshot amount. Returns the fresh
 * reads, or null after dispatching the reason nothing was sent.
 */
async function recheck(deps: FlowDeps, opts?: { minBlock?: bigint }): Promise<Reads | null> {
  const fresh = await deps.refresh(opts)
  if (!deps.isCurrent()) return null
  if (fresh.status === 'ok' && fresh.stale) {
    deps.dispatch({
      type: 'CHECK_FAILED',
      id: deps.id,
      message:
        'The public Ethereum nodes are behind the chain right now, so the figures could not be re-checked. Nothing was sent. Try again in a moment.',
    })
    return null
  }
  if (
    fresh.status !== 'ok' ||
    !fresh.verification.ok ||
    !fresh.account ||
    !sameAddress(fresh.account.address, deps.account)
  ) {
    deps.dispatch({
      type: 'CHECK_FAILED',
      id: deps.id,
      message: 'Could not re-check the contract before sending. Nothing was sent.',
    })
    return null
  }
  const classification = classifyAmount({
    direction: deps.direction,
    amount: deps.amount,
    balance: balanceOf(fresh, deps.direction),
    cap: capOf(fresh, deps.direction),
    paused: fresh.hook?.paused ?? null,
  })
  if (classification !== 'ok') {
    const cap = capOf(fresh, deps.direction)
    const balance = balanceOf(fresh, deps.direction)
    const message =
      classification === 'exceeds-cap'
        ? (capAdvice({ direction: deps.direction, amount: deps.amount, cap }) ??
          'The contract cannot pay out that much right now.')
        : classification === 'paused'
          ? describeRevert('SwapsPaused', [], deps.direction)
          : classification === 'exceeds-balance'
            ? `That is more than this account holds: ${balance === null ? '—' : formatAmountExact(balance)} ${tokenIn(deps.direction)}. Nothing was sent.`
            : 'The figures could not be read. Nothing was sent.'
    deps.dispatch({ type: 'CHECK_FAILED', id: deps.id, message })
    return null
  }
  return fresh
}

/** First click: re-check, then approve if needed, else migrate. */
export async function startFlow(deps: FlowDeps): Promise<void> {
  const fresh = await recheck(deps)
  if (!fresh) return
  const steps = planSteps({ allowance: allowanceOf(fresh, deps.direction), amount: deps.amount })
  if (steps[0] === 'approve') await approve(deps)
  else await send(deps)
}

/** Second click, after the approval mined. */
export async function continueFlow(deps: FlowDeps): Promise<void> {
  const fresh = await recheck(
    deps,
    deps.approvedAtBlock ? { minBlock: deps.approvedAtBlock } : undefined,
  )
  if (!fresh) return
  const allowance = allowanceOf(fresh, deps.direction)
  if (allowance === null || allowance < deps.amount) {
    deps.dispatch({
      type: 'FAIL',
      id: deps.id,
      kind: 'approved-less',
      message:
        `The allowance is ${allowance === null ? 'unreadable' : formatAmountExact(allowance)}, less than the ` +
        `${formatAmountExact(deps.amount)} you entered. Approve again for the full amount, or lower the amount.`,
    })
    return
  }
  await send(deps)
}

async function approve(deps: FlowDeps): Promise<void> {
  const wallet = deps.getWalletClient()
  if (!wallet) {
    deps.dispatch({
      type: 'FAIL',
      id: deps.id,
      message: 'No wallet is connected. Nothing was sent.',
    })
    return
  }
  let hash: Hash
  try {
    const { request } = await publicClient.simulateContract({
      address: inputToken(deps),
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [deps.hook, deps.amount],
      account: deps.account,
    })
    if (!deps.isCurrent()) return
    if (!sameAddress(request.args[0], deps.hook) || request.args[1] !== deps.amount) {
      throw new Error(
        'The approval request does not match what this page asked for. Stop and report it.',
      )
    }
    deps.dispatch({ type: 'APPROVE_PROMPT', id: deps.id })
    hash = await wallet.writeContract(request)
  } catch (err) {
    if (!deps.isCurrent()) return
    const explained = explainError(err, deps.direction)
    deps.dispatch({ type: 'FAIL', id: deps.id, message: explained.message, kind: explained.kind })
    return
  }
  if (!deps.isCurrent()) {
    trackLate(deps, 'approve', hash)
    return
  }
  deps.dispatch({ type: 'APPROVE_SENT', id: deps.id, hash, at: Date.now() })

  const receipt = await waitFor(
    hash,
    (h) => deps.dispatch({ type: 'APPROVE_REPLACED', id: deps.id, hash: h, reason: 'repriced' }),
    (reason, h) => deps.dispatch({ type: 'APPROVE_REPLACED', id: deps.id, hash: h, reason }),
    () => deps.dispatch({ type: 'RELEASE', id: deps.id }),
  )
  if (receipt.status === 'reverted') {
    deps.dispatch({
      type: 'FAIL',
      id: deps.id,
      kind: 'reverted',
      hash: receipt.transactionHash,
      message: describeReceipt({ status: 'reverted', reason: 'the token refused the approval' }),
    })
    return
  }
  // Read the allowance back: some wallets let the user edit the amount.
  const after = await deps.refresh({ minBlock: receipt.blockNumber })
  const allowance = allowanceOf(after, deps.direction)
  if (allowance !== null && allowance < deps.amount) {
    deps.dispatch({
      type: 'FAIL',
      id: deps.id,
      kind: 'approved-less',
      hash: receipt.transactionHash,
      message:
        `Your wallet approved ${formatAmountExact(allowance)}, less than the ${formatAmountExact(deps.amount)} you ` +
        'entered. Some wallets let you edit the amount in the approval prompt. Approve again for the full amount, ' +
        'or lower the amount.',
    })
    return
  }
  deps.dispatch({
    type: 'APPROVE_MINED',
    id: deps.id,
    hash: receipt.transactionHash,
    allowance: allowance ?? undefined,
    blockNumber: receipt.blockNumber,
  })
}

async function send(deps: FlowDeps): Promise<void> {
  const wallet = deps.getWalletClient()
  if (!wallet) {
    deps.dispatch({
      type: 'FAIL',
      id: deps.id,
      message: 'No wallet is connected. Nothing was sent.',
    })
    return
  }
  const functionName = deps.direction === 'forward' ? 'migrate' : 'unmigrate'
  let hash: Hash
  try {
    const { request } = await publicClient.simulateContract({
      address: deps.hook,
      abi: MIGRATOR_ABI,
      functionName,
      args: [deps.amount, deps.account],
      account: deps.account,
    })
    if (!deps.isCurrent()) return
    if (!sameAddress(request.args[1], deps.account) || request.args[0] !== deps.amount) {
      throw new Error(
        'The migration request does not match what this page asked for. Stop and report it.',
      )
    }
    deps.dispatch({ type: 'SEND_PROMPT', id: deps.id })
    hash = await wallet.writeContract(request)
  } catch (err) {
    if (!deps.isCurrent()) return
    const explained = explainError(err, deps.direction)
    deps.dispatch({ type: 'FAIL', id: deps.id, message: explained.message, kind: explained.kind })
    return
  }
  if (!deps.isCurrent()) {
    trackLate(deps, 'send', hash)
    return
  }
  deps.dispatch({ type: 'SEND_SENT', id: deps.id, hash, at: Date.now() })

  const receipt = await waitFor(
    hash,
    (h) => deps.dispatch({ type: 'SEND_REPLACED', id: deps.id, hash: h, reason: 'repriced' }),
    (reason, h) => deps.dispatch({ type: 'SEND_REPLACED', id: deps.id, hash: h, reason }),
    () => deps.dispatch({ type: 'RELEASE', id: deps.id }),
  )

  if (receipt.status === 'reverted') {
    const reason = await likelyCause(deps, receipt.blockNumber)
    deps.dispatch({
      type: 'FAIL',
      id: deps.id,
      kind: 'reverted',
      hash: receipt.transactionHash,
      message: describeReceipt({ status: 'reverted', reason }),
    })
    void deps.refresh({ minBlock: receipt.blockNumber })
    return
  }

  const logs = parseEventLogs({
    abi: MIGRATOR_ABI,
    logs: receipt.logs,
    eventName: deps.direction === 'forward' ? 'Migrated' : 'Unmigrated',
  }).filter((log) => sameAddress(log.address, deps.hook))
  const event = logs.length === 1 ? logs[0] : null
  const to = event?.args.to ?? null
  const moved = event?.args.amount ?? null
  if (!event || !sameAddress(to, deps.account) || moved !== deps.amount) {
    deps.dispatch({
      type: 'FAIL',
      id: deps.id,
      kind: 'event-mismatch',
      hash: receipt.transactionHash,
      message: describeEventMismatch({
        expectedTo: deps.account,
        actualTo: to,
        expectedAmount: deps.amount,
        actualAmount: moved,
      }),
    })
    void deps.refresh({ minBlock: receipt.blockNumber })
    return
  }

  deps.dispatch({
    type: 'SEND_MINED',
    id: deps.id,
    hash: receipt.transactionHash,
    to: event.args.to,
    amount: event.args.amount,
    blockNumber: receipt.blockNumber,
  })
  void deps.refresh({ minBlock: receipt.blockNumber })
}
