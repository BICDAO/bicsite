/**
 * The NFD -> BIC migration, minus the browser.
 *
 * Everything here is plain JavaScript with no imports at all — no viem, no
 * window, no process, no fetch — for the same reason lib/sheet.mjs is: so
 * `node --test` can prove the arithmetic, the configuration rules, the
 * on-chain verification, the copy and the transaction state machine without a
 * wallet, a network or a build step. The React components under
 * src/components/migrate/ are thin: they read the chain, call these functions,
 * and render what comes back.
 *
 * Ported from DeVamp (devanh/DeVamp#98) on 2026-09-18, unchanged except for
 * this site's own links and storage key: the arithmetic, the verification and
 * the reducer are the code that was exercised against a mainnet fork, and
 * rewriting them for a new house style would throw that away.
 *
 * Three rules this file exists to enforce:
 *
 *   1. AMOUNTS ARE BIGINTS, END TO END. Both tokens have 18 decimals, so a
 *      balance is a 27-digit integer and `Number` loses the low ten digits.
 *      `parseAmount` never rounds what the user typed (a 19th decimal place is
 *      an error, not a rounding), and `formatAmountExact` round-trips it. The
 *      lossy display form is marked `lossy` so the UI can say "≈".
 *
 *   2. THE PAGE TRUSTS NOTHING IT WAS TOLD. NFD, the community multisig and
 *      the Uniswap PoolManager are constants here and never environment
 *      variables — the RUNBOOK says not to trust a file, a chat message or a
 *      search result for an address, and an env var is all three. The hook and
 *      BIC addresses do arrive from configuration, and `verifyDeployment`
 *      then checks thirteen things on chain before any button is allowed to
 *      ask a wallet for anything. See `readConfig` for the production rule.
 *
 *   3. THE FLOW IS A REDUCER. Approve -> migrate is two prompts with a wait
 *      between them, the wallet can replace or cancel either, the account or
 *      network can change underneath, and a public node can lag. `flowReducer`
 *      is the one place that decides what happens next, it ignores events
 *      from a flow that is no longer current, and it is walked end to end in
 *      test/migration.test.mjs.
 *
 * ⚠️ The ABI is hand-written from src/MigratorHook.sol in the contracts repo.
 * That repo's integrations/paraswap/ ABI is not a substitute: it carries no
 * errors, so a revert would decode to nothing, and no `owner`/`poolManager`,
 * which the verification needs.
 */

// --- constants ---------------------------------------------------------------

export const MAINNET_CHAIN_ID = 1;
export const DECIMALS = 18;
export const ZERO = 0n;
export const ONE_TOKEN = 10n ** 18n;

/** Feisty Doge on Ethereum mainnet — the only NFD the migration knows. */
export const NFD_ADDRESS = '0xDFDb7f72c1F195C5951a234e8DB9806EB0635346';
/** Owner of the hook and rescue treasury of BIC. RUNBOOK §0. */
export const COMMUNITY_MULTISIG = '0x8569FCa4fb54CE58228992CDA60bc920A574cf39';
/** Uniswap v4 PoolManager, Ethereum mainnet. RUNBOOK §0. */
export const POOL_MANAGER = '0x000000000004444c5dc75cB358380D2e3dE08A90';
export const NFD_SYMBOL = 'NFD';
export const BIC_SYMBOL = 'BIC';
/** BICToken.TOTAL_SUPPLY — 100 billion, fixed at deploy. */
export const BIC_TOTAL_SUPPLY = 100_000_000_000n * 10n ** 18n;
/** Feisty Doge's own page on this site (Liquid Assets). */
export const NFD_ASSET_SLUG = 'feisty-doge-nft';

/**
 * The production pin.
 *
 * Null until the contracts are deployed, smoke-tested on a preview deployment,
 * and pinned here by a reviewed pull request. While these are null a
 * production build ignores the address environment variables entirely — see
 * `readConfig` — so the only way the live site starts asking wallets to sign
 * is a code change somebody read.
 */
export const KNOWN_HOOK = '0x78d1A97a9239443070BE0353C68762CCCF64a888';
export const KNOWN_BIC = '0xB1cDa04D7cD5584048ab48B42b629aEC34D3b562';

export const CONTRACTS_REPO_URL = 'https://github.com/BICDAO/NFD-BIC-Migration';
/** The repo was private on 2026-09-12. Flip when it is published. */
export const CONTRACTS_REPO_PUBLIC = false;
/**
 * Null renders NO audit line at all, and it is expected to stay null: the owner
 * ruled on 2026-09-12 that there will be NO external audit. The review is an LLM
 * pass plus testnet and mainnet-fork exercises — see the contracts repo's
 * RUNBOOK §1b and REVIEW_BRIEF.md. Set this only if an external firm is ever
 * engaged and publishes a report; an LLM review is not one, and putting a link
 * to one here would tell readers something false.
 */
export const AUDIT_URL = null;
/**
 * DeVamp, where this page used to live. It keeps the authenticity review of
 * Feisty Doge — the provenance work behind the token being migrated — so the
 * page links out to it rather than restating it.
 */
export const DEVAMP_URL = 'https://devamp.it';
export const NFD_REVIEW_URL = 'https://devamp.it/token/feisty-doge';

/**
 * Public mainnet nodes the browser reads through, in order. Each answered a
 * browser CORS preflight with `access-control-allow-origin: *` on 2026-09-04.
 * eth.llamarpc.com (521) and eth.merkle.io (405 to POST) did not, and are
 * deliberately absent. Reads only; nothing here can sign.
 */
export const PUBLIC_RPCS = [
  'https://ethereum-rpc.publicnode.com',
  'https://cloudflare-eth.com',
  'https://ethereum.reth.rs/rpc',
];

/** How often the caps are re-read while the tab is visible. */
export const POLL_MS = 12_000;
/** Reads older than this are shown as stale and block the action button. */
export const STALE_MS = 90_000;
/** After this long pending, a step is released to "stalled" (still watched). */
export const PENDING_RELEASE_MS = 600_000;
/** sessionStorage key for the last chosen wallet's rdns. */
export const SESSION_KEY = 'bic:migrate:wallet';

// --- addresses ---------------------------------------------------------------

const ADDRESS_SHAPE = /^0x[0-9a-fA-F]{40}$/;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/** Shaped like an address. Not a checksum check — that is viem's `getAddress`. */
export function isAddressShaped(value) {
  return typeof value === 'string' && ADDRESS_SHAPE.test(value.trim());
}

/** Case-insensitive equality. False when either side is missing. */
export function sameAddress(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// --- amounts -----------------------------------------------------------------

const DIGITS_ONLY = /^\d*\.?\d*$/;
/** uint256 max. Anything above it cannot be an ERC-20 amount, whatever was typed. */
export const MAX_UINT256 = 2n ** 256n - 1n;

/**
 * Parses what the user typed into raw units, or says exactly why not.
 *
 * Deliberately narrower than viem's `parseUnits`, which rounds a 19th decimal
 * place half-away-from-zero and accepts a leading minus. Nothing here rounds:
 * more fraction digits than the token has is `too-many-decimals`, and the UI
 * says so rather than sending a different number than the one on screen.
 */
export function parseAmount(text, decimals = DECIMALS) {
  if (typeof text !== 'string') return { ok: false, reason: 'invalid' };
  const trimmed = text.trim();
  if (trimmed === '') return { ok: false, reason: 'empty' };
  if (!DIGITS_ONLY.test(trimmed) || !/\d/.test(trimmed)) {
    return { ok: false, reason: 'invalid' };
  }
  const [whole = '', fraction = ''] = trimmed.split('.');
  if (fraction.length > decimals) return { ok: false, reason: 'too-many-decimals' };
  const scale = 10n ** BigInt(decimals);
  const value = BigInt(whole || '0') * scale + BigInt(fraction.padEnd(decimals, '0') || '0');
  if (value === ZERO) return { ok: false, reason: 'zero' };
  if (value > MAX_UINT256) return { ok: false, reason: 'too-large' };
  return { ok: true, value };
}

function group(integer) {
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function split(value, decimals) {
  const negative = value < ZERO;
  const abs = negative ? -value : value;
  const scale = 10n ** BigInt(decimals);
  const whole = (abs / scale).toString();
  const fraction = (abs % scale).toString().padStart(decimals, '0');
  return { negative, whole, fraction };
}

/**
 * Display form: grouped integer, at most `maxFraction` decimals, truncated —
 * never rounded, so a shown number is never more than the real one. `lossy`
 * is true when nonzero digits were dropped; the UI prefixes those with "≈".
 */
export function formatAmount(value, { decimals = DECIMALS, maxFraction = 4 } = {}) {
  const { negative, whole, fraction } = split(value, decimals);
  const kept = fraction.slice(0, maxFraction);
  const dropped = fraction.slice(maxFraction);
  const lossy = /[1-9]/.test(dropped);
  const trimmed = kept.replace(/0+$/, '');
  const sign = negative ? '-' : '';
  if (whole === '0' && trimmed === '' && value !== ZERO) {
    // Nonzero but below what the decimals can show: say so, do not print 0.
    const floor = maxFraction > 0 ? `0.${'0'.repeat(maxFraction - 1)}1` : '1';
    return { text: `${sign}<${floor}`, lossy: true };
  }
  return { text: `${sign}${group(whole)}${trimmed ? `.${trimmed}` : ''}`, lossy };
}

/** Exact, ungrouped, no exponent. Round-trips `parseAmount`. */
export function formatAmountExact(value, decimals = DECIMALS) {
  const { negative, whole, fraction } = split(value, decimals);
  const trimmed = fraction.replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${trimmed ? `.${trimmed}` : ''}`;
}

/** Exact, with the integer part grouped. For `title` attributes and logs. */
export function formatAmountGrouped(value, decimals = DECIMALS) {
  const { negative, whole, fraction } = split(value, decimals);
  const trimmed = fraction.replace(/0+$/, '');
  return `${negative ? '-' : ''}${group(whole)}${trimmed ? `.${trimmed}` : ''}`;
}

// --- configuration -----------------------------------------------------------

function blank(value) {
  return value == null || String(value).trim() === '';
}

/**
 * Decides whether the page is live, from the environment and the pin.
 *
 * Preview deployments and local dev honour NEXT_PUBLIC_MIGRATOR_HOOK and
 * NEXT_PUBLIC_BIC_TOKEN so the launch smoke test can run. Production ignores
 * them: it goes live only when KNOWN_HOOK/KNOWN_BIC are set in this file. An
 * env value is editable by anyone with dashboard access and reviewed by
 * nobody, and the on-chain checks in `verifyDeployment` defend against a typo,
 * not against a look-alike contract built to pass them. The kill switch works
 * everywhere and can only turn the page off.
 *
 * Addresses come back trimmed but with their casing intact, so the browser can
 * run viem's `getAddress` and refuse a mixed-case value whose checksum fails.
 */
export function readConfig({ hook, bic, disabled, vercelEnv, nodeEnv, knownHook, knownBic } = {}) {
  const off = !blank(disabled) && ['1', 'true'].includes(String(disabled).trim().toLowerCase());
  if (off) return { state: 'unconfigured', reason: 'disabled' };

  // Production is Vercel's production environment, or a production build
  // anywhere Vercel is not setting the variable at all (self-hosted, a bare
  // `next build && next start`). A Vercel preview has NODE_ENV=production
  // too, and VERCEL_ENV=preview, so it keeps the env path.
  const production = vercelEnv === 'production' || (blank(vercelEnv) && nodeEnv === 'production');
  if (production) {
    if (blank(knownHook) || blank(knownBic)) {
      return { state: 'unconfigured', reason: 'production-unpinned' };
    }
    const problems = checkPair(String(knownHook).trim(), String(knownBic).trim(), 'KNOWN_HOOK', 'KNOWN_BIC');
    if (problems.length) return { state: 'invalid', problems };
    return { state: 'configured', hook: String(knownHook).trim(), bic: String(knownBic).trim(), source: 'pinned' };
  }

  const hookSet = !blank(hook);
  const bicSet = !blank(bic);
  if (!hookSet && !bicSet) return { state: 'unconfigured', reason: 'unset' };

  const problems = [];
  if (hookSet !== bicSet) {
    problems.push(
      hookSet
        ? 'NEXT_PUBLIC_MIGRATOR_HOOK is set and NEXT_PUBLIC_BIC_TOKEN is not; set both or neither'
        : 'NEXT_PUBLIC_BIC_TOKEN is set and NEXT_PUBLIC_MIGRATOR_HOOK is not; set both or neither',
    );
    return { state: 'invalid', problems };
  }

  const hookValue = String(hook).trim();
  const bicValue = String(bic).trim();
  const pairProblems = checkPair(hookValue, bicValue, 'NEXT_PUBLIC_MIGRATOR_HOOK', 'NEXT_PUBLIC_BIC_TOKEN');
  if (pairProblems.length) return { state: 'invalid', problems: pairProblems };

  return { state: 'configured', hook: hookValue, bic: bicValue, source: 'env' };
}

/** The shape rules a hook/BIC pair must pass, whichever source it came from. */
function checkPair(hookValue, bicValue, hookName, bicName) {
  const problems = [];
  if (!isAddressShaped(hookValue)) problems.push(`${hookName} is not shaped like an address`);
  if (!isAddressShaped(bicValue)) problems.push(`${bicName} is not shaped like an address`);
  if (problems.length) return problems;
  if (sameAddress(hookValue, ZERO_ADDRESS)) problems.push(`${hookName} is the zero address`);
  if (sameAddress(bicValue, ZERO_ADDRESS)) problems.push(`${bicName} is the zero address`);
  if (sameAddress(hookValue, bicValue)) problems.push(`${hookName} and ${bicName} are the same address`);
  if (sameAddress(bicValue, NFD_ADDRESS)) problems.push(`${bicName} is the NFD address`);
  if (sameAddress(hookValue, NFD_ADDRESS)) problems.push(`${hookName} is the NFD address`);
  return problems;
}

// --- on-chain verification ---------------------------------------------------

/**
 * What the page confirms before it lets anyone sign, in render order.
 *
 * The honest limit: a contract deliberately built with the real NFD, the real
 * BIC, the multisig as owner and the real PoolManager passes every row. These
 * catch a mistake — a pasted testnet address, a stale deployment, the wrong
 * token — not a forgery. The production pin in `readConfig` is the control
 * against that.
 */
export const VERIFICATION_CHECKS = Object.freeze([
  { key: 'rpcChainId', label: 'Reads come from Ethereum mainnet' },
  { key: 'hookCode', label: 'Contract code at the migration address' },
  { key: 'bicCode', label: 'Contract code at the BIC address' },
  { key: 'tokenA', label: 'The migration contract takes NFD' },
  { key: 'tokenB', label: 'The migration contract pays BIC' },
  { key: 'poolManager', label: 'The migration contract uses the Uniswap v4 PoolManager' },
  { key: 'owner', label: 'The migration contract is owned by the community multisig' },
  { key: 'bicSymbol', label: 'BIC answers as BIC' },
  { key: 'bicDecimals', label: 'BIC has 18 decimals' },
  { key: 'bicSupply', label: 'BIC supply is 100,000,000,000' },
  { key: 'bicTreasury', label: 'BIC rescues to the community multisig' },
  { key: 'nfdSymbol', label: 'The NFD address answers as NFD' },
  { key: 'nfdDecimals', label: 'NFD has 18 decimals' },
]);

function hasCode(code) {
  return typeof code === 'string' && code !== '0x' && code.length > 2;
}

/**
 * Pure over values already read from the chain. `undefined` means not read
 * yet (row `ok: null`); `null` means the call failed (row fails).
 */
export function verifyDeployment(reads = {}, expected = {}) {
  const r = reads;
  const rules = {
    rpcChainId: () => r.rpcChainId === MAINNET_CHAIN_ID,
    hookCode: () => hasCode(r.hookCode),
    bicCode: () => hasCode(r.bicCode),
    tokenA: () => sameAddress(r.tokenA, NFD_ADDRESS),
    tokenB: () => sameAddress(r.tokenB, expected.bic),
    poolManager: () => sameAddress(r.poolManager, POOL_MANAGER),
    owner: () => sameAddress(r.owner, COMMUNITY_MULTISIG),
    bicSymbol: () => r.bicSymbol === BIC_SYMBOL,
    bicDecimals: () => r.bicDecimals === DECIMALS,
    bicSupply: () => typeof r.bicTotalSupply === 'bigint' && r.bicTotalSupply === BIC_TOTAL_SUPPLY,
    bicTreasury: () => sameAddress(r.bicTreasury, COMMUNITY_MULTISIG),
    nfdSymbol: () => r.nfdSymbol === NFD_SYMBOL,
    nfdDecimals: () => r.nfdDecimals === DECIMALS,
  };
  const inputs = {
    rpcChainId: r.rpcChainId,
    hookCode: r.hookCode,
    bicCode: r.bicCode,
    tokenA: r.tokenA,
    tokenB: r.tokenB,
    poolManager: r.poolManager,
    owner: r.owner,
    bicSymbol: r.bicSymbol,
    bicDecimals: r.bicDecimals,
    bicSupply: r.bicTotalSupply,
    bicTreasury: r.bicTreasury,
    nfdSymbol: r.nfdSymbol,
    nfdDecimals: r.nfdDecimals,
  };
  const checks = VERIFICATION_CHECKS.map(({ key, label }) => ({
    key,
    label,
    ok: inputs[key] === undefined ? null : rules[key]() === true,
  }));
  return { ok: checks.every((c) => c.ok === true), checks };
}

/**
 * Sanity on the two capacities. The inventory is BIC the hook holds, so it
 * cannot exceed BIC's supply; the escrow is NFD, so it cannot exceed NFD's. A
 * read that says otherwise is a wrong contract or a wrong node, and the page
 * shows dashes rather than an impossible number.
 */
export function isConsistent({ inventoryB, escrowedA, bicTotalSupply, nfdTotalSupply }) {
  if ([inventoryB, escrowedA, bicTotalSupply, nfdTotalSupply].some((v) => typeof v !== 'bigint')) {
    return false;
  }
  return inventoryB <= bicTotalSupply && escrowedA <= nfdTotalSupply;
}

// --- the form's arithmetic ---------------------------------------------------

export function tokenIn(direction) {
  return direction === 'forward' ? NFD_SYMBOL : BIC_SYMBOL;
}

export function tokenOut(direction) {
  return direction === 'forward' ? BIC_SYMBOL : NFD_SYMBOL;
}

/**
 * Why the button is disabled, in order of what the user should hear first.
 * `paused` only applies going forward: the contract cannot pause the reverse.
 */
export function classifyAmount({ direction, amount, balance, cap, paused }) {
  if (direction === 'forward' && paused === true) return 'paused';
  if (typeof amount !== 'bigint' || amount === ZERO) return 'zero';
  if (typeof balance !== 'bigint' || typeof cap !== 'bigint') return 'unread';
  if (amount > balance) return 'exceeds-balance';
  if (amount > cap) return 'exceeds-cap';
  return 'ok';
}

export function needsApproval(allowance, amount) {
  return typeof allowance !== 'bigint' || allowance < amount;
}

export function planSteps({ allowance, amount }) {
  return needsApproval(allowance, amount) ? ['approve', 'send'] : ['send'];
}

/** The most this account can send right now: its balance or the contract's room. */
export function maxAmount({ balance, cap }) {
  if (typeof balance !== 'bigint' || typeof cap !== 'bigint') return null;
  return balance <= cap ? { value: balance, cappedBy: 'balance' } : { value: cap, cappedBy: 'cap' };
}

/**
 * The "split it" advice RUNBOOK §8 asks for. Null when the amount fits.
 */
export function capAdvice({ direction, amount, cap }) {
  if (typeof amount !== 'bigint' || typeof cap !== 'bigint' || amount <= cap) return null;
  if (cap === ZERO) {
    return direction === 'forward'
      ? 'The contract has no BIC inventory to pay out right now. Nothing can migrate until the treasury tops it up; nothing is lost by waiting.'
      : 'The escrow holds no NFD right now, so nothing can be redeemed. Only NFD that came in through a migration is in the escrow.';
  }
  const room = formatAmountExact(cap);
  if (direction === 'forward') {
    return (
      `The contract can pay out ${room} BIC in one transaction right now. ` +
      `Split it: migrate ${room} now and the rest after the inventory is topped up. ` +
      'Nothing is lost by splitting — the rate is one for one every time.'
    );
  }
  return (
    `The escrow holds ${room} NFD right now. Only NFD that came in through a migration ` +
    `is in the escrow, so BIC bought elsewhere can exceed it. Split it: redeem up to ${room} now.`
  );
}

// --- copy for failures -------------------------------------------------------

export const PAUSED_SENTENCE =
  'The community multisig has stopped new NFD → BIC migrations for now — usually because ' +
  'the NFD vault is in an auction. BIC → NFD still works; the contract cannot pause it.';

function big(value) {
  return typeof value === 'bigint' ? formatAmountExact(value) : String(value);
}

/**
 * A decoded custom error, in plain words. Unknown names get the generic line;
 * nothing here throws, because this runs inside a catch.
 */
export function describeRevert(name, args, direction) {
  const a = Array.isArray(args) ? args : [];
  switch (name) {
    case 'SwapsPaused':
      return `Forward migration is paused. ${PAUSED_SENTENCE}`;
    case 'InsufficientInventory':
      if (a[0] === ZERO) {
        return 'The contract has no BIC inventory to pay out right now. Nothing was taken; try again after the treasury tops it up.';
      }
      return (
        `The contract can pay out ${big(a[0])} BIC in one transaction right now and you asked for ` +
        `${big(a[1])}. Split it: migrate ${big(a[0])} now and the rest after the inventory is topped up. ` +
        'Nothing was taken.'
      );
    case 'InsufficientEscrowBalance':
      if (a[0] === ZERO) return 'The escrow holds no NFD right now, so nothing can be redeemed. Nothing was taken.';
      return (
        `The escrow holds ${big(a[0])} NFD right now and you asked for ${big(a[1])}. Only NFD that came ` +
        'in through a migration is in the escrow, so BIC bought elsewhere can exceed it. ' +
        `Redeem up to ${big(a[0])} now.`
      );
    case 'ZeroAddress':
      return (
        'The contract refused a zero recipient. This page always sends to the account you connected, ' +
        'so this should be impossible — stop and report it.'
      );
    case 'TransferFromFailed':
      return (
        'The token refused the transfer. Usually the allowance or the balance changed since this page ' +
        'last looked. Reload and try again.'
      );
    case 'SettlementMismatch':
      return (
        'The token moved a different amount than requested, which means it is not behaving like a ' +
        'plain ERC-20. Stop; do not retry; report it.'
      );
    case 'ERC20InsufficientAllowance':
    case 'ERC20InsufficientBalance':
      return `${tokenIn(direction)} refused: the allowance (or balance) is short. Reload and try again.`;
    case 'Error':
      return `${tokenIn(direction)} refused: ${a[0] ?? 'no reason given'}.`;
    default:
      return `The contract refused: ${name || 'unknown error'}. Nothing moved.`;
  }
}

/** EIP-1193 provider error codes, in plain words. */
export function describeWalletError(code, shortMessage) {
  switch (code) {
    case 4001:
      return 'You declined in your wallet. Nothing was sent.';
    case -32002:
      return 'Your wallet already has a request open. Find it in the wallet window.';
    case 4900:
    case 4901:
      return 'Your wallet is not on Ethereum mainnet.';
    case 4902:
      return 'Your wallet has no Ethereum mainnet entry. Add it in the wallet, not here.';
    default:
      return `${shortMessage ? shortMessage.replace(/\.?$/, '') : 'The wallet returned an error'}.`;
  }
}

export function describeReceipt({ status, reason } = {}) {
  if (status === 'success') return 'Mined.';
  return (
    'The transaction was mined but reverted, so no tokens moved; the gas was spent. ' +
    (reason ? `Likely cause: ${reason}` : 'Most likely the available amount changed while the transaction waited.')
  );
}

export function describeEventMismatch({ expectedTo, actualTo, expectedAmount, actualAmount }) {
  const saw =
    actualAmount == null && actualTo == null
      ? 'saw no matching event'
      : `saw ${actualAmount == null ? 'an unreadable amount' : big(actualAmount)} to ${actualTo ?? 'nobody'}`;
  return (
    'The transaction was mined but its event does not match what this page asked for ' +
    `(expected ${big(expectedAmount)} to ${expectedTo}, ${saw}). ` +
    'Stop, do not retry, and report it with the hash.'
  );
}

// --- the flow ----------------------------------------------------------------

/**
 * One migration, from click to mined.
 *
 * The START event snapshots direction, amount and account; every later step,
 * label and sentence reads the snapshot, never the live inputs, so nothing the
 * user does to the form after clicking can change what is being signed. Every
 * event after START carries the flow's `id`, and an event for a flow that is
 * no longer current is ignored by returning the same object — a late promise
 * from an aborted flow cannot land on a new one.
 */
export function initialFlow() {
  return {
    id: null,
    step: 'idle',
    direction: null,
    amount: null,
    account: null,
    approveHash: null,
    sendHash: null,
    replaced: [],
    approvedAllowance: null,
    approvedAtBlock: null,
    approveMined: false,
    pendingSince: null,
    stalledFrom: null,
    mined: null,
    failure: null,
  };
}

const IN_FLIGHT = new Set(['checking', 'approve-sign', 'approve-pending', 'approved', 'send-sign', 'send-pending', 'stalled']);

export function isInFlight(step) {
  return IN_FLIGHT.has(step);
}

export function flowReducer(flow, event) {
  if (!event || typeof event.type !== 'string') return flow;

  if (event.type === 'RESET' || event.type === 'DISMISS') {
    if (flow.step === 'idle') return flow;
    // DISMISS is the explicit way out of a stall, and out of "approved" — the
    // approval stays on chain as an allowance, which the form then shows with
    // a Revoke button; nothing about dismissing is lost or unsafe.
    if (event.type === 'DISMISS' && flow.step !== 'stalled' && flow.step !== 'approved') return flow;
    if (event.type === 'RESET' && !['mined', 'failed', 'aborted', 'stalled'].includes(flow.step)) return flow;
    return initialFlow();
  }

  if (event.type === 'START') {
    if (flow.step !== 'idle' && flow.step !== 'approved') return flow;
    if (flow.step === 'approved') {
      // Second click after the approval mined: same snapshot, same id.
      if (event.id !== undefined && event.id !== flow.id) return flow;
      return { ...flow, step: 'checking' };
    }
    if (typeof event.amount !== 'bigint' || !event.account || !event.direction) return flow;
    return {
      ...initialFlow(),
      id: event.id ?? null,
      step: 'checking',
      direction: event.direction,
      amount: event.amount,
      account: event.account,
    };
  }

  if (event.type === 'ABORT') {
    if (!isInFlight(flow.step)) return flow;
    return { ...flow, step: 'aborted', pendingSince: null };
  }

  // Everything below belongs to a specific flow.
  if (event.id !== undefined && event.id !== flow.id) return flow;

  // A wallet can confirm a prompt after the page aborted the flow around it.
  // The hash is real and belongs in the log; it does not revive the flow.
  if (event.type === 'LATE_HASH') {
    if (flow.step !== 'aborted' || typeof event.hash !== 'string') return flow;
    return event.which === 'approve' ? { ...flow, approveHash: event.hash } : { ...flow, sendHash: event.hash };
  }

  switch (event.type) {
    case 'CHECK_FAILED':
      if (flow.step !== 'checking') return flow;
      return { ...flow, step: 'failed', failure: { message: event.message, kind: 'check', hash: null, from: 'checking' } };

    case 'APPROVE_PROMPT':
      if (flow.step !== 'checking') return flow;
      return { ...flow, step: 'approve-sign' };

    case 'APPROVE_SENT':
      if (flow.step !== 'approve-sign') return flow;
      return { ...flow, step: 'approve-pending', approveHash: event.hash, pendingSince: event.at ?? null };

    case 'APPROVE_REPLACED':
      if (flow.step !== 'approve-pending' && !(flow.step === 'stalled' && flow.stalledFrom === 'approve')) return flow;
      if (event.reason === 'repriced') {
        return {
          ...flow,
          approveHash: event.hash,
          replaced: [...flow.replaced, { step: 'approve', from: flow.approveHash, to: event.hash, reason: 'repriced' }],
        };
      }
      return {
        ...flow,
        step: 'failed',
        replaced: [...flow.replaced, { step: 'approve', from: flow.approveHash, to: event.hash, reason: event.reason }],
        failure: { message: describeReplacement(event.reason), kind: event.reason, hash: event.hash, from: flow.step },
      };

    case 'APPROVE_MINED':
      if (flow.step !== 'approve-pending' && !(flow.step === 'stalled' && flow.stalledFrom === 'approve')) return flow;
      return {
        ...flow,
        step: 'approved',
        approveHash: event.hash ?? flow.approveHash,
        approveMined: true,
        approvedAllowance: typeof event.allowance === 'bigint' ? event.allowance : flow.approvedAllowance,
        approvedAtBlock: typeof event.blockNumber === 'bigint' ? event.blockNumber : flow.approvedAtBlock,
        pendingSince: null,
        stalledFrom: null,
      };

    case 'SEND_PROMPT':
      if (flow.step !== 'checking') return flow;
      return { ...flow, step: 'send-sign' };

    case 'SEND_SENT':
      if (flow.step !== 'send-sign') return flow;
      return { ...flow, step: 'send-pending', sendHash: event.hash, pendingSince: event.at ?? null };

    case 'SEND_REPLACED':
      if (flow.step !== 'send-pending' && !(flow.step === 'stalled' && flow.stalledFrom === 'send')) return flow;
      if (event.reason === 'repriced') {
        return {
          ...flow,
          sendHash: event.hash,
          replaced: [...flow.replaced, { step: 'send', from: flow.sendHash, to: event.hash, reason: 'repriced' }],
        };
      }
      return {
        ...flow,
        step: 'failed',
        replaced: [...flow.replaced, { step: 'send', from: flow.sendHash, to: event.hash, reason: event.reason }],
        failure: { message: describeReplacement(event.reason), kind: event.reason, hash: event.hash, from: flow.step },
      };

    case 'SEND_MINED':
      if (flow.step !== 'send-pending' && !(flow.step === 'stalled' && flow.stalledFrom === 'send')) return flow;
      return {
        ...flow,
        step: 'mined',
        sendHash: event.hash ?? flow.sendHash,
        pendingSince: null,
        stalledFrom: null,
        mined: {
          hash: event.hash ?? flow.sendHash,
          to: event.to ?? flow.account,
          amount: typeof event.amount === 'bigint' ? event.amount : flow.amount,
          blockNumber: event.blockNumber ?? null,
        },
      };

    case 'FAIL':
      if (!isInFlight(flow.step)) return flow;
      // A stall is not a failure. Whatever watcher gave up, the transaction is
      // still on chain, and "Try again" on top of it is the one thing this
      // state exists to prevent.
      if (flow.step === 'stalled' && event.kind === 'timeout') return flow;
      return {
        ...flow,
        step: 'failed',
        pendingSince: null,
        failure: { message: event.message, kind: event.kind ?? 'error', hash: event.hash ?? null, from: flow.step },
      };

    case 'RELEASE':
      if (flow.step === 'approve-pending') return { ...flow, step: 'stalled', stalledFrom: 'approve' };
      if (flow.step === 'send-pending') return { ...flow, step: 'stalled', stalledFrom: 'send' };
      return flow;

    default:
      return flow;
  }
}

export function describeReplacement(reason) {
  if (reason === 'cancelled') {
    return 'You cancelled the transaction in your wallet before it was mined.';
  }
  return (
    'A different transaction replaced this one in your wallet before it was mined. Nothing from ' +
    'this page was sent in its place — check it on Etherscan.'
  );
}

function shortAccount(account) {
  if (typeof account !== 'string' || account.length <= 12) return String(account ?? '');
  return `${account.slice(0, 6)}…${account.slice(-4)}`;
}

/**
 * The action button and the aria-live sentence for a flow snapshot.
 *
 * `ctx` is only consulted while idle — that is the one step where the live
 * form decides the label. Once a flow has started, the snapshot does.
 */
export function describeFlow(flow, ctx = {}) {
  const dir = flow.direction ?? ctx.direction ?? 'forward';
  const amount = flow.amount ?? ctx.amount ?? null;
  const shown = typeof amount === 'bigint' ? formatAmountExact(amount) : '';
  const inTok = tokenIn(dir);
  const sendLabel = dir === 'forward' ? `Migrate ${shown} NFD to BIC` : `Redeem ${shown} BIC for NFD`;

  switch (flow.step) {
    case 'idle': {
      switch (ctx.classification) {
        case 'paused':
          return { label: 'Forward migration is paused', disabled: true, status: null };
        case 'unread':
          return { label: 'Figures not read yet', disabled: true, status: null };
        case 'exceeds-balance':
          return { label: 'More than this account holds', disabled: true, status: null };
        case 'exceeds-cap':
          return { label: 'More than the contract can pay out in one go', disabled: true, status: null };
        case 'ok':
          return ctx.needsApproval
            ? { label: `Approve ${shown} ${inTok}`, disabled: false, status: null }
            : { label: sendLabel, disabled: false, status: null };
        default:
          return { label: 'Enter an amount', disabled: true, status: null };
      }
    }
    case 'checking':
      return { label: 'Checking…', disabled: true, status: 'Checking the contract before asking your wallet.' };
    case 'approve-sign':
      return {
        label: 'Confirm in your wallet…',
        disabled: true,
        status: `Confirm the approval of ${shown} ${inTok} in your wallet. It is for exactly that amount.`,
      };
    case 'approve-pending':
      return {
        label: 'Waiting for Ethereum…',
        disabled: true,
        status: flow.replaced.some((r) => r.step === 'approve' && r.reason === 'repriced')
          ? 'Your wallet sped this up; following the replacement.'
          : 'Approval sent. Waiting for Ethereum.',
      };
    case 'approved':
      return {
        label: sendLabel,
        disabled: false,
        status:
          dir === 'forward'
            ? 'Approved. Click again to confirm the migration in your wallet.'
            : 'Approved. Click again to confirm the redemption in your wallet.',
      };
    case 'send-sign':
      return {
        label: 'Confirm in your wallet…',
        disabled: true,
        status:
          dir === 'forward'
            ? `Confirm the migration of ${shown} NFD in your wallet.`
            : `Confirm redeeming ${shown} BIC for NFD in your wallet.`,
      };
    case 'send-pending':
      return {
        label: 'Waiting for Ethereum…',
        disabled: true,
        status: flow.replaced.some((r) => r.step === 'send' && r.reason === 'repriced')
          ? 'Your wallet sped this up; following the replacement.'
          : 'Migration sent. Waiting for Ethereum.',
      };
    case 'mined': {
      const done = formatAmountExact(flow.mined?.amount ?? amount ?? ZERO);
      const who = shortAccount(flow.mined?.to ?? flow.account);
      return {
        label: dir === 'forward' ? 'Migrate more' : 'Redeem more',
        disabled: false,
        status:
          dir === 'forward'
            ? `Done. ${done} NFD went into escrow and ${done} BIC arrived in ${who} — confirmed from the transaction's own event.`
            : `Done. ${done} BIC went back into the inventory and ${done} NFD arrived in ${who} — confirmed from the transaction's own event.`,
      };
    }
    case 'failed':
      return { label: 'Try again', disabled: false, status: flow.failure?.message ?? 'Failed.' };
    case 'aborted':
      return {
        label: 'Start again',
        disabled: false,
        status:
          'This flow stopped because the account, the network or the contract checks changed under it. Anything already sent is still on chain — see above.',
      };
    case 'stalled':
      return {
        label: 'Still pending — follow it on Etherscan',
        disabled: true,
        status:
          'Still pending after ten minutes. Follow it on Etherscan; it stays on chain. Do not send a second one on top of it.',
      };
    default:
      return { label: 'Enter an amount', disabled: true, status: null };
  }
}

// --- ABI ---------------------------------------------------------------------

/**
 * Human-readable ABI, hand-written from src/MigratorHook.sol. The errors are
 * the point: without them in the ABI a revert decodes to a bare selector.
 */
export const MIGRATOR_ABI_SIGNATURES = Object.freeze([
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
]);

/**
 * Plain ERC-20, plus the custom errors BIC can raise. BIC is OpenZeppelin's
 * ERC20 (v5), so its errors are the ERC-6093 ones; NFD is an older
 * ERC20Upgradeable that reverts with `Error(string)`, already handled.
 */
export const ERC20_ABI_SIGNATURES = Object.freeze([
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
]);

export const BIC_ABI_SIGNATURES = Object.freeze([
  ...ERC20_ABI_SIGNATURES,
  'function treasury() view returns (address)',
]);
