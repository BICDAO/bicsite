/**
 * Types for lib/migration.mjs.
 *
 * That module is plain JavaScript so `node --test` can cover the migration's
 * arithmetic, configuration rules, verification and state machine with no
 * build step and no network — the same bargain as lib/sheet.mjs. The cost is
 * this file: hand-written, and TypeScript will not tell you when it drifts.
 * test/migration.test.mjs compares the exported names here against the
 * runtime module, and the ABI tuples element for element, so a drift fails
 * `npm test` rather than showing up as a wrong type in a component.
 *
 * The ABI signature arrays are declared as literal tuples on purpose: that is
 * what lets viem's `parseAbi` infer function names, argument and return types
 * for every call the page makes.
 */

export const MAINNET_CHAIN_ID: 1
export const DECIMALS: 18
export const ZERO: bigint
export const ONE_TOKEN: bigint
export const NFD_ADDRESS: '0xDFDb7f72c1F195C5951a234e8DB9806EB0635346'
export const COMMUNITY_MULTISIG: '0x8569FCa4fb54CE58228992CDA60bc920A574cf39'
export const POOL_MANAGER: '0x000000000004444c5dc75cB358380D2e3dE08A90'
export const NFD_SYMBOL: 'NFD'
export const BIC_SYMBOL: 'BIC'
export const BIC_TOTAL_SUPPLY: bigint
export const NFD_ASSET_SLUG: 'feisty-doge-nft'
export const KNOWN_HOOK: string | null
export const KNOWN_BIC: string | null
export const CONTRACTS_REPO_URL: string
export const CONTRACTS_REPO_PUBLIC: boolean
export const AUDIT_URL: string | null
export const DEVAMP_URL: string
export const NFD_REVIEW_URL: string
export const PUBLIC_RPCS: readonly string[]
export const POLL_MS: number
export const STALE_MS: number
export const PENDING_RELEASE_MS: number
export const SESSION_KEY: string
export const PAUSED_SENTENCE: string
export const MAX_UINT256: bigint

export function isAddressShaped(value: unknown): boolean
export function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean

export type ParsedAmount =
  | { ok: true; value: bigint }
  | { ok: false; reason: 'empty' | 'invalid' | 'too-many-decimals' | 'zero' | 'too-large' }
export function parseAmount(text: string, decimals?: number): ParsedAmount
export function formatAmount(
  value: bigint,
  options?: { decimals?: number; maxFraction?: number },
): { text: string; lossy: boolean }
export function formatAmountExact(value: bigint, decimals?: number): string
export function formatAmountGrouped(value: bigint, decimals?: number): string

export type ConfigInput = {
  hook?: string | null
  bic?: string | null
  disabled?: string | null
  vercelEnv?: string | null
  nodeEnv?: string | null
  knownHook?: string | null
  knownBic?: string | null
}
export type Config =
  | { state: 'unconfigured'; reason: 'disabled' | 'unset' | 'production-unpinned' }
  | { state: 'invalid'; problems: string[] }
  | { state: 'configured'; hook: string; bic: string; source: 'pinned' | 'env' }
export function readConfig(input?: ConfigInput): Config

export type CheckKey =
  | 'rpcChainId'
  | 'hookCode'
  | 'bicCode'
  | 'tokenA'
  | 'tokenB'
  | 'poolManager'
  | 'owner'
  | 'bicSymbol'
  | 'bicDecimals'
  | 'bicSupply'
  | 'bicTreasury'
  | 'nfdSymbol'
  | 'nfdDecimals'
export const VERIFICATION_CHECKS: readonly { key: CheckKey; label: string }[]
export type DeploymentReads = {
  rpcChainId?: number | null
  hookCode?: string | null
  bicCode?: string | null
  tokenA?: string | null
  tokenB?: string | null
  owner?: string | null
  poolManager?: string | null
  bicSymbol?: string | null
  bicDecimals?: number | null
  bicTotalSupply?: bigint | null
  bicTreasury?: string | null
  nfdSymbol?: string | null
  nfdDecimals?: number | null
}
export type Verification = {
  ok: boolean
  checks: { key: CheckKey; label: string; ok: boolean | null }[]
}
export function verifyDeployment(
  reads?: DeploymentReads,
  expected?: { bic?: string | null },
): Verification
export function isConsistent(values: {
  inventoryB: bigint | null
  escrowedA: bigint | null
  bicTotalSupply: bigint | null
  nfdTotalSupply: bigint | null
}): boolean

export type Direction = 'forward' | 'reverse'
export function tokenIn(direction: Direction): 'NFD' | 'BIC'
export function tokenOut(direction: Direction): 'NFD' | 'BIC'
export type Classification = 'ok' | 'zero' | 'paused' | 'unread' | 'exceeds-balance' | 'exceeds-cap'
export function classifyAmount(input: {
  direction: Direction
  amount: bigint | null
  balance: bigint | null
  cap: bigint | null
  paused: boolean | null
}): Classification
export function needsApproval(allowance: bigint | null, amount: bigint): boolean
export function planSteps(input: {
  allowance: bigint | null
  amount: bigint
}): ['approve', 'send'] | ['send']
export function maxAmount(input: { balance: bigint | null; cap: bigint | null }): {
  value: bigint
  cappedBy: 'balance' | 'cap'
} | null
export function capAdvice(input: {
  direction: Direction
  amount: bigint | null
  cap: bigint | null
}): string | null

export function describeRevert(
  name: string | undefined,
  args: readonly unknown[] | undefined,
  direction: Direction,
): string
export function describeWalletError(code: number | null | undefined, shortMessage?: string): string
export function describeReceipt(input?: {
  status?: 'success' | 'reverted'
  reason?: string | null
}): string
export function describeEventMismatch(input: {
  expectedTo: string
  actualTo: string | null | undefined
  expectedAmount: bigint
  actualAmount: bigint | null | undefined
}): string
export function describeReplacement(reason: 'replaced' | 'cancelled' | string): string

export type FlowStep =
  | 'idle'
  | 'checking'
  | 'approve-sign'
  | 'approve-pending'
  | 'approved'
  | 'send-sign'
  | 'send-pending'
  | 'mined'
  | 'failed'
  | 'aborted'
  | 'stalled'
export type Replacement = {
  step: 'approve' | 'send'
  from: string | null
  to: string
  reason: 'repriced' | 'replaced' | 'cancelled'
}
export type Flow = {
  id: string | null
  step: FlowStep
  direction: Direction | null
  amount: bigint | null
  account: string | null
  approveHash: string | null
  sendHash: string | null
  replaced: Replacement[]
  approvedAllowance: bigint | null
  /** Block the approval mined in; the second click re-reads no earlier than this. */
  approvedAtBlock: bigint | null
  approveMined: boolean
  pendingSince: number | null
  stalledFrom: 'approve' | 'send' | null
  mined: { hash: string; to: string; amount: bigint; blockNumber: bigint | null } | null
  /** `from` is the step the flow was in when it failed. */
  failure: { message: string; kind: string; hash: string | null; from: FlowStep } | null
}
export type FlowEvent =
  | { type: 'START'; id: string; direction: Direction; amount: bigint; account: string }
  | { type: 'CHECK_FAILED'; id: string; message: string }
  | { type: 'APPROVE_PROMPT'; id: string }
  | { type: 'APPROVE_SENT'; id: string; hash: string; at?: number }
  | {
      type: 'APPROVE_REPLACED'
      id: string
      hash: string
      reason: 'repriced' | 'replaced' | 'cancelled'
    }
  | { type: 'APPROVE_MINED'; id: string; hash?: string; allowance?: bigint; blockNumber?: bigint }
  | { type: 'SEND_PROMPT'; id: string }
  | { type: 'SEND_SENT'; id: string; hash: string; at?: number }
  | {
      type: 'SEND_REPLACED'
      id: string
      hash: string
      reason: 'repriced' | 'replaced' | 'cancelled'
    }
  | {
      type: 'SEND_MINED'
      id: string
      hash: string
      to: string
      amount: bigint
      blockNumber: bigint | null
    }
  | { type: 'FAIL'; id: string; message: string; kind?: string; hash?: string | null }
  | { type: 'LATE_HASH'; id: string; which: 'approve' | 'send'; hash: string }
  | { type: 'ABORT' }
  | { type: 'RELEASE'; id: string }
  | { type: 'DISMISS' }
  | { type: 'RESET' }
export function initialFlow(): Flow
export function isInFlight(step: FlowStep): boolean
export function flowReducer(flow: Flow, event: FlowEvent): Flow
export type FlowContext = {
  direction?: Direction
  amount?: bigint | null
  classification?: Classification | null
  needsApproval?: boolean
}
export function describeFlow(
  flow: Flow,
  ctx?: FlowContext,
): { label: string; disabled: boolean; status: string | null }

export const MIGRATOR_ABI_SIGNATURES: readonly [
  'function migrate(uint256 amount, address to)',
  'function unmigrate(uint256 amount, address to)',
  'function paused() view returns (bool)',
  'function inventoryB() view returns (uint256)',
  'function escrowedA() view returns (uint256)',
  'function tokenA() view returns (address)',
  'function tokenB() view returns (address)',
  'function owner() view returns (address)',
  'function poolManager() view returns (address)',
  'event Migrated(address indexed sender, address indexed to, uint256 amount)',
  'event Unmigrated(address indexed sender, address indexed to, uint256 amount)',
  'event PauseChanged(bool paused)',
  'event InventoryFunded(address indexed funder, uint256 amount)',
  'event InventoryWithdrawn(address indexed to, uint256 amount)',
  'error ZeroAddress()',
  'error TokensMustDiffer()',
  'error DecimalMismatch(uint8 tokenADecimals, uint8 tokenBDecimals)',
  'error SwapsPaused()',
  'error InsufficientInventory(uint256 available, uint256 required)',
  'error InsufficientEscrowBalance(uint256 available, uint256 required)',
  'error SettlementMismatch(uint256 settled, uint256 expected)',
  'error InvalidLiquidityPosition(int24 tickSpacing, int24 tickLower, int24 tickUpper)',
  'error InvalidTickSpacing(int24 tickSpacing)',
  'error InvalidInitialPrice(uint160 sqrtPriceX96)',
  'error UnknownUnlockOperation(uint8 op)',
  'error TransferFromFailed()',
  'error Reentrancy()',
  'error Unauthorized()',
  'error NotPoolManager()',
]

export const ERC20_ABI_SIGNATURES: readonly [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function totalSupply() view returns (uint256)',
  'error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)',
  'error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)',
  'error ERC20InvalidApprover(address approver)',
  'error ERC20InvalidReceiver(address receiver)',
  'error ERC20InvalidSender(address sender)',
  'error ERC20InvalidSpender(address spender)',
]

export const BIC_ABI_SIGNATURES: readonly [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function totalSupply() view returns (uint256)',
  'error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)',
  'error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)',
  'error ERC20InvalidApprover(address approver)',
  'error ERC20InvalidReceiver(address receiver)',
  'error ERC20InvalidSender(address sender)',
  'error ERC20InvalidSpender(address spender)',
  'function treasury() view returns (address)',
]
