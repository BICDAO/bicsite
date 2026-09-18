import {
  BaseError,
  ChainMismatchError,
  ContractFunctionRevertedError,
  InsufficientFundsError,
  SwitchChainError,
  UserRejectedRequestError,
  WaitForTransactionReceiptTimeoutError,
} from 'viem'
import { describeRevert, describeWalletError, type Direction } from '@/lib/migration'

/**
 * Turns whatever viem or a wallet threw into one plain sentence and a kind
 * the flow can branch on. Order matters: a revert decoded against the ABI is
 * the most specific thing we can say, a user rejection the most common.
 */
export type Explained = { message: string; kind: string }

export function explainError(err: unknown, direction: Direction): Explained {
  if (err instanceof WaitForTransactionReceiptTimeoutError) {
    return { message: 'Still pending.', kind: 'timeout' }
  }
  if (err instanceof BaseError) {
    const reverted = err.walk(
      (e) => e instanceof ContractFunctionRevertedError,
    ) as ContractFunctionRevertedError | null
    if (reverted) {
      const name = reverted.data?.errorName ?? (reverted.reason ? 'Error' : undefined)
      const args = reverted.data?.args ?? (reverted.reason ? [reverted.reason] : undefined)
      return {
        message: describeRevert(name, args, direction),
        kind: name ? `revert:${name}` : 'revert',
      }
    }
    if (err.walk((e) => e instanceof UserRejectedRequestError)) {
      return { message: describeWalletError(4001), kind: 'rejected' }
    }
    if (err.walk((e) => e instanceof InsufficientFundsError)) {
      return { message: 'Not enough ETH in this account to pay for gas.', kind: 'funds' }
    }
    if (err.walk((e) => e instanceof ChainMismatchError)) {
      return { message: 'Your wallet is not on Ethereum mainnet.', kind: 'chain' }
    }
    if (err.walk((e) => e instanceof SwitchChainError)) {
      return { message: describeWalletError(4902), kind: 'chain' }
    }
    const withCode = err.walk((e) => typeof (e as { code?: unknown }).code === 'number') as {
      code: number
    } | null
    if (withCode && withCode.code !== -32603 && withCode.code !== 3) {
      return {
        message: describeWalletError(withCode.code, err.shortMessage),
        kind: `wallet:${withCode.code}`,
      }
    }
    if (/fetch|network|timeout|HTTP request failed/i.test(err.shortMessage)) {
      return {
        message:
          'Could not reach Ethereum to check the transaction. It may still be mined; follow it on Etherscan.',
        kind: 'rpc',
      }
    }
    return { message: describeWalletError(null, err.shortMessage), kind: 'error' }
  }
  const message = err instanceof Error ? err.message : String(err)
  return { message: describeWalletError(null, message), kind: 'error' }
}
