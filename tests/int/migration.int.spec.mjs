/**
 * Proves src/lib/migration.mjs before a wallet ever sees it.
 *
 * That module is the whole NFD -> BIC migration minus the browser: the amount
 * arithmetic, the configuration rule that keeps production dark until a
 * reviewed pin, the thirteen on-chain checks, the copy for every failure, and
 * the reducer that walks approve -> migrate through replacements, stalls and
 * aborts. Every one of those is a pure function, so every one is asserted here
 * with no network, no wallet and no build step — the same bargain as
 * the DeVamp suite this came from.
 *
 * Three things this file is unusually strict about, because the cost of being
 * wrong is somebody's tokens:
 *
 *   - Amounts are bigints and nothing rounds. The parse fixtures include the
 *     shapes a browser input can produce ('1e18', '１', '1,000'), and each must
 *     be refused with a named reason, never coerced.
 *   - Illegal reducer transitions and events from a stale flow must return the
 *     IDENTICAL object (===), so a late promise from an aborted flow cannot
 *     land on a new one and React does not re-render for nothing.
 *   - src/lib/migration.d.ts is hand-written. The last group compares its export
 *     names and its ABI tuples against the runtime module, so a drift fails
 *     `npm test` instead of showing up as a wrong type in a component.
 *
 * viem's `parseAbi` is imported for one reason: a signature string with a typo
 * would pass a substring check and then throw in the browser. Parsing it here
 * is pure and offline.
 *
 *   pnpm test:int
 */

import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseAbi } from 'viem'
import * as migration from '../../src/lib/migration.mjs'
import {
  AUDIT_URL,
  BIC_ABI_SIGNATURES,
  BIC_SYMBOL,
  BIC_TOTAL_SUPPLY,
  COMMUNITY_MULTISIG,
  CONTRACTS_REPO_PUBLIC,
  CONTRACTS_REPO_URL,
  DEVAMP_URL,
  DECIMALS,
  ERC20_ABI_SIGNATURES,
  KNOWN_BIC,
  KNOWN_HOOK,
  MAINNET_CHAIN_ID,
  MIGRATOR_ABI_SIGNATURES,
  NFD_ADDRESS,
  NFD_ASSET_SLUG,
  NFD_REVIEW_URL,
  NFD_SYMBOL,
  ONE_TOKEN,
  PAUSED_SENTENCE,
  PENDING_RELEASE_MS,
  POLL_MS,
  POOL_MANAGER,
  PUBLIC_RPCS,
  SESSION_KEY,
  STALE_MS,
  VERIFICATION_CHECKS,
  ZERO,
  capAdvice,
  classifyAmount,
  describeEventMismatch,
  describeFlow,
  describeReceipt,
  describeReplacement,
  describeRevert,
  describeWalletError,
  flowReducer,
  formatAmount,
  formatAmountExact,
  formatAmountGrouped,
  initialFlow,
  isAddressShaped,
  isConsistent,
  isInFlight,
  maxAmount,
  needsApproval,
  parseAmount,
  planSteps,
  readConfig,
  sameAddress,
  tokenIn,
  tokenOut,
  verifyDeployment,
} from '../../src/lib/migration.mjs'

// --- fixtures ----------------------------------------------------------------

/** Whole tokens in raw units. Both tokens have 18 decimals. */
const tokens = (n) => n * ONE_TOKEN

const HOOK = '0x1111111111111111111111111111111111111111'
/** Mixed case on purpose: the case-insensitivity tests need letters to flip. */
const BIC = '0xB1cB1cB1cB1cB1cB1cB1cB1cB1cB1cB1cB1cB1cB'
const OTHER = '0x3333333333333333333333333333333333333333'
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const ACCOUNT = '0xAbCdEf0123456789AbCdEf0123456789AbCdEf01'
/** What `describeFlow` prints for ACCOUNT: first six, ellipsis, last four. */
const SHORT_ACCOUNT = '0xAbCd…Ef01'
const AMOUNT = tokens(5n)

const hash = (n) => `0x${String(n).padStart(64, '0')}`
const H1 = hash(1)
const H2 = hash(2)
const H3 = hash(3)
const H4 = hash(4)

/** Identity, spelled out: the reducer's promise is the SAME object, not an equal one. */
const same = (actual, expected, message) => assert.ok(actual === expected, message)

// --- 1. parseAmount ----------------------------------------------------------

test('parseAmount: the accepted shapes, at 18 decimals, never rounded', () => {
  const ok = [
    // [typed, raw units, what formatAmountExact gives back]
    ['1', ONE_TOKEN, '1'],
    ['1.5', 15n * 10n ** 17n, '1.5'],
    ['.5', 5n * 10n ** 17n, '0.5'],
    ['5.', tokens(5n), '5'],
    ['0.000000000000000001', 1n, '0.000000000000000001'],
    [' 7 ', tokens(7n), '7'],
    ['007', tokens(7n), '7'],
    ['100000000000', BIC_TOTAL_SUPPLY, '100000000000'],
  ]
  for (const [text, value, normalised] of ok) {
    assert.deepStrictEqual(parseAmount(text), { ok: true, value }, JSON.stringify(text))
    // The exact form round-trips: what the page shows is what it parsed.
    assert.equal(
      formatAmountExact(value),
      normalised,
      `formatAmountExact of ${JSON.stringify(text)}`,
    )
    assert.deepStrictEqual(
      parseAmount(normalised),
      { ok: true, value },
      `re-parse of ${normalised}`,
    )
  }
})

test('parseAmount: every rejection names its reason', () => {
  const bad = {
    'too-many-decimals': ['0.0000000000000000001', '1.0000000000000000001', '.1234567890123456789'],
    zero: ['0', '0.000', '.0', '0.', '000'],
    empty: ['', '  ', '\t\n'],
    // Commas, spaces, exponents, signs, hex, a second point, a fullwidth digit,
    // a lone point: shapes a browser input can produce, none of them a number
    // this page will send.
    invalid: [
      '1,000',
      '1 000',
      '1e18',
      '-1',
      '+1',
      '0x1',
      '1.2.3',
      '１',
      '.',
      'abc',
      '1n',
      '1_000',
      'NaN',
      'Infinity',
    ],
  }
  for (const [reason, inputs] of Object.entries(bad)) {
    for (const text of inputs) {
      assert.deepStrictEqual(parseAmount(text), { ok: false, reason }, JSON.stringify(text))
    }
  }
  // Not a string is invalid, not a throw: the input's value is always a string,
  // but nothing here should be the thing that crashes a render.
  for (const value of [null, undefined, 1, 1n, {}, []]) {
    assert.deepStrictEqual(parseAmount(value), { ok: false, reason: 'invalid' }, String(value))
  }
})

test('parseAmount honours the decimals argument', () => {
  assert.deepStrictEqual(parseAmount('1.5', 6), { ok: true, value: 1_500_000n })
  assert.deepStrictEqual(parseAmount('0.000001', 6), { ok: true, value: 1n })
  assert.deepStrictEqual(parseAmount('0.0000001', 6), { ok: false, reason: 'too-many-decimals' })
  assert.deepStrictEqual(parseAmount('1', 0), { ok: true, value: 1n })
  assert.deepStrictEqual(parseAmount('1.1', 0), { ok: false, reason: 'too-many-decimals' })
})

// --- 2. formatAmount ---------------------------------------------------------

test('formatAmount truncates, groups, and marks what it dropped', () => {
  assert.deepStrictEqual(formatAmount(1999999999999999999n), { text: '1.9999', lossy: true })
  assert.deepStrictEqual(formatAmount(15_000_000_000n * ONE_TOKEN), {
    text: '15,000,000,000',
    lossy: false,
  })
  assert.deepStrictEqual(formatAmount(ZERO), { text: '0', lossy: false })
  assert.deepStrictEqual(formatAmount(1n), { text: '<0.0001', lossy: true })
  // Trailing zeros go; dropped zeros are not a loss.
  assert.deepStrictEqual(formatAmount(tokens(1n) + 5n * 10n ** 17n), { text: '1.5', lossy: false })
  assert.deepStrictEqual(formatAmount(tokens(1n) + 10n ** 14n), { text: '1.0001', lossy: false })
  assert.deepStrictEqual(formatAmount(15n * 10n ** 14n), { text: '0.0015', lossy: false })
  // Truncation is not rounding: 0.00019999 shows as 0.0001, never 0.0002.
  assert.deepStrictEqual(formatAmount(19999n * 10n ** 10n), { text: '0.0001', lossy: true })
  // maxFraction is respected, including zero and the full eighteen.
  assert.deepStrictEqual(formatAmount(1999999999999999999n, { maxFraction: 2 }), {
    text: '1.99',
    lossy: true,
  })
  assert.deepStrictEqual(formatAmount(1999999999999999999n, { maxFraction: 0 }), {
    text: '1',
    lossy: true,
  })
  assert.deepStrictEqual(formatAmount(1999999999999999999n, { maxFraction: 18 }), {
    text: '1.999999999999999999',
    lossy: false,
  })
  // The floor generalises with maxFraction.
  assert.deepStrictEqual(formatAmount(1n, { maxFraction: 6 }), { text: '<0.000001', lossy: true })
  assert.deepStrictEqual(formatAmount(1n, { maxFraction: 0 }), { text: '<1', lossy: true })
  assert.deepStrictEqual(formatAmount(999n * 10n ** 13n), { text: '0.0099', lossy: true })
  // Other decimals, and a negative (a delta, never a balance).
  assert.deepStrictEqual(formatAmount(1_500_000n, { decimals: 6 }), { text: '1.5', lossy: false })
  assert.deepStrictEqual(formatAmount(-(tokens(1n) + 5n * 10n ** 17n)), {
    text: '-1.5',
    lossy: false,
  })
})

test('formatAmountExact is exact: no grouping, no exponent, no rounding', () => {
  assert.equal(formatAmountExact(ZERO), '0')
  assert.equal(formatAmountExact(1n), '0.000000000000000001')
  assert.equal(formatAmountExact(BIC_TOTAL_SUPPLY), '100000000000')
  assert.equal(formatAmountExact(1999999999999999999n), '1.999999999999999999')
  assert.equal(formatAmountExact(-(tokens(2n) + 1n)), '-2.000000000000000001')
  assert.equal(formatAmountExact(1_500_000n, 6), '1.5')
  // The 27-digit case that motivates bigints: Number would lose the low digits.
  const balance = 123456789012345678901234567n
  assert.equal(formatAmountExact(balance), '123456789.012345678901234567')
  assert.notEqual(String(Number(balance) / 1e18), '123456789.012345678901234567')
  for (const value of [1n, ONE_TOKEN, BIC_TOTAL_SUPPLY, 1999999999999999999n, balance]) {
    assert.deepStrictEqual(parseAmount(formatAmountExact(value)), { ok: true, value })
  }
})

test('formatAmountGrouped groups the integer part and keeps the whole fraction', () => {
  assert.equal(
    formatAmountGrouped(15_000_000_000n * ONE_TOKEN + 5n * 10n ** 17n),
    '15,000,000,000.5',
  )
  assert.equal(formatAmountGrouped(1999999999999999999n), '1.999999999999999999')
  assert.equal(formatAmountGrouped(BIC_TOTAL_SUPPLY), '100,000,000,000')
  assert.equal(formatAmountGrouped(ZERO), '0')
  assert.equal(formatAmountGrouped(tokens(999n)), '999')
  assert.equal(formatAmountGrouped(tokens(1000n)), '1,000')
  assert.equal(formatAmountGrouped(-tokens(1234n)), '-1,234')
  assert.equal(formatAmountGrouped(1_234_500_000n, 6), '1,234.5')
})

// --- addresses ---------------------------------------------------------------

test('isAddressShaped and sameAddress: shape only, case-blind, never a throw', () => {
  for (const good of [
    NFD_ADDRESS,
    HOOK,
    BIC,
    ZERO_ADDRESS,
    `  ${ACCOUNT}\n`,
    ACCOUNT.toLowerCase(),
  ]) {
    assert.equal(isAddressShaped(good), true, good)
  }
  for (const bad of [
    '',
    '0x',
    HOOK.slice(0, 41),
    `${HOOK}1`,
    HOOK.slice(2),
    '0xGGGG111111111111111111111111111111111111',
    null,
    undefined,
    42,
    {},
  ]) {
    assert.equal(isAddressShaped(bad), false, String(bad))
  }
  assert.equal(sameAddress(ACCOUNT, ACCOUNT.toLowerCase()), true)
  assert.equal(sameAddress(` ${ACCOUNT} `, ACCOUNT.toUpperCase().replace('0X', '0x')), true)
  assert.equal(sameAddress(ACCOUNT, OTHER), false)
  for (const missing of [null, undefined, 42]) {
    assert.equal(sameAddress(ACCOUNT, missing), false)
    assert.equal(sameAddress(missing, ACCOUNT), false)
  }
  assert.equal(sameAddress(null, null), false, 'two missing addresses are not the same address')
})

// --- 3. readConfig -----------------------------------------------------------

test('readConfig: both blank is "unset", not an error', () => {
  for (const input of [
    undefined,
    {},
    { hook: '', bic: '' },
    { hook: null, bic: undefined },
    { hook: '   ', bic: '\t' },
  ]) {
    assert.deepStrictEqual(
      readConfig(input),
      { state: 'unconfigured', reason: 'unset' },
      JSON.stringify(input),
    )
  }
})

test('readConfig: one address without the other is invalid, and the problem names both', () => {
  assert.deepStrictEqual(readConfig({ hook: HOOK }), {
    state: 'invalid',
    problems: [
      'NEXT_PUBLIC_MIGRATOR_HOOK is set and NEXT_PUBLIC_BIC_TOKEN is not; set both or neither',
    ],
  })
  assert.deepStrictEqual(readConfig({ hook: ' ', bic: BIC }), {
    state: 'invalid',
    problems: [
      'NEXT_PUBLIC_BIC_TOKEN is set and NEXT_PUBLIC_MIGRATOR_HOOK is not; set both or neither',
    ],
  })
  // A malformed lone value is still reported as the pair problem first: the
  // fix is the same either way.
  assert.equal(readConfig({ bic: 'nonsense' }).problems.length, 1)
})

test('readConfig: a malformed value is invalid and names its variable', () => {
  assert.deepStrictEqual(readConfig({ hook: '0x123', bic: BIC }), {
    state: 'invalid',
    problems: ['NEXT_PUBLIC_MIGRATOR_HOOK is not shaped like an address'],
  })
  assert.deepStrictEqual(readConfig({ hook: HOOK, bic: BIC.slice(0, 41) }), {
    state: 'invalid',
    problems: ['NEXT_PUBLIC_BIC_TOKEN is not shaped like an address'],
  })
  assert.deepStrictEqual(readConfig({ hook: 'nope', bic: `${BIC}0` }).problems, [
    'NEXT_PUBLIC_MIGRATOR_HOOK is not shaped like an address',
    'NEXT_PUBLIC_BIC_TOKEN is not shaped like an address',
  ])
})

test('readConfig: the zero address, the same address and the NFD address are refused, case-insensitively', () => {
  assert.deepStrictEqual(readConfig({ hook: ZERO_ADDRESS, bic: BIC }).problems, [
    'NEXT_PUBLIC_MIGRATOR_HOOK is the zero address',
  ])
  assert.deepStrictEqual(readConfig({ hook: HOOK, bic: ZERO_ADDRESS }).problems, [
    'NEXT_PUBLIC_BIC_TOKEN is the zero address',
  ])
  assert.deepStrictEqual(readConfig({ hook: BIC.toLowerCase(), bic: BIC }).problems, [
    'NEXT_PUBLIC_MIGRATOR_HOOK and NEXT_PUBLIC_BIC_TOKEN are the same address',
  ])
  assert.deepStrictEqual(readConfig({ hook: HOOK, bic: NFD_ADDRESS.toLowerCase() }).problems, [
    'NEXT_PUBLIC_BIC_TOKEN is the NFD address',
  ])
  assert.deepStrictEqual(
    readConfig({ hook: NFD_ADDRESS.toUpperCase().replace('0X', '0x'), bic: BIC }).problems,
    ['NEXT_PUBLIC_MIGRATOR_HOOK is the NFD address'],
  )
  // Problems accumulate rather than stopping at the first, so one read fixes all.
  assert.deepStrictEqual(
    readConfig({ hook: NFD_ADDRESS, bic: NFD_ADDRESS.toLowerCase() }).problems,
    [
      'NEXT_PUBLIC_MIGRATOR_HOOK and NEXT_PUBLIC_BIC_TOKEN are the same address',
      'NEXT_PUBLIC_BIC_TOKEN is the NFD address',
      'NEXT_PUBLIC_MIGRATOR_HOOK is the NFD address',
    ],
  )
  for (const input of [
    { hook: ZERO_ADDRESS, bic: BIC },
    { hook: HOOK, bic: HOOK },
    { hook: HOOK, bic: NFD_ADDRESS },
  ]) {
    assert.equal(readConfig(input).state, 'invalid')
  }
})

test('readConfig: values are trimmed and their casing is preserved for the checksum step', () => {
  assert.deepStrictEqual(readConfig({ hook: `  ${HOOK}\n`, bic: ` ${BIC} ` }), {
    state: 'configured',
    hook: HOOK,
    bic: BIC,
    source: 'env',
  })
  // Lower-casing here would hide a bad EIP-55 checksum from viem's getAddress.
  assert.equal(readConfig({ hook: HOOK, bic: BIC }).bic, BIC)
  assert.notEqual(readConfig({ hook: HOOK, bic: BIC }).bic, BIC.toLowerCase())
})

test('readConfig: the kill switch wins over every other input, in every environment', () => {
  const off = { state: 'unconfigured', reason: 'disabled' }
  for (const disabled of ['1', 'true', 'TRUE', ' 1 ', 'True', '\ttrue\n']) {
    assert.deepStrictEqual(
      readConfig({ hook: HOOK, bic: BIC, disabled }),
      off,
      JSON.stringify(disabled),
    )
    assert.deepStrictEqual(
      readConfig({ disabled, vercelEnv: 'production', knownHook: HOOK, knownBic: BIC }),
      off,
      `production ${JSON.stringify(disabled)}`,
    )
    assert.deepStrictEqual(
      readConfig({ disabled }),
      off,
      `nothing else set, ${JSON.stringify(disabled)}`,
    )
  }
  for (const disabled of ['', '0', 'false', null, undefined]) {
    assert.equal(
      readConfig({ hook: HOOK, bic: BIC, disabled }).state,
      'configured',
      JSON.stringify(disabled),
    )
  }
})

test('readConfig: production ignores the environment and goes live only through the pin', () => {
  const unpinned = { state: 'unconfigured', reason: 'production-unpinned' }
  // A valid env pair in production is ignored while the pin is null.
  assert.deepStrictEqual(
    readConfig({ hook: HOOK, bic: BIC, vercelEnv: 'production', knownHook: null, knownBic: null }),
    unpinned,
  )
  assert.deepStrictEqual(readConfig({ hook: HOOK, bic: BIC, vercelEnv: 'production' }), unpinned)
  // Half a pin is no pin.
  assert.deepStrictEqual(
    readConfig({ hook: HOOK, bic: BIC, vercelEnv: 'production', knownHook: HOOK, knownBic: null }),
    unpinned,
  )
  assert.deepStrictEqual(
    readConfig({ vercelEnv: 'production', knownHook: '', knownBic: BIC }),
    unpinned,
  )
  // Pinned: the constants, source 'pinned', and the env — even a different,
  // even a malformed value — is not consulted at all.
  const pinned = { state: 'configured', hook: HOOK, bic: BIC, source: 'pinned' }
  assert.deepStrictEqual(
    readConfig({
      hook: OTHER,
      bic: 'garbage',
      vercelEnv: 'production',
      knownHook: HOOK,
      knownBic: BIC,
    }),
    pinned,
  )
  assert.deepStrictEqual(
    readConfig({ vercelEnv: 'production', knownHook: ` ${HOOK} `, knownBic: `${BIC}\n` }),
    pinned,
  )
  // Preview, development and a missing VERCEL_ENV honour the env and ignore the pin.
  for (const vercelEnv of ['preview', 'development', undefined, null, '']) {
    assert.deepStrictEqual(
      readConfig({ hook: HOOK, bic: BIC, vercelEnv, knownHook: OTHER, knownBic: OTHER }),
      { state: 'configured', hook: HOOK, bic: BIC, source: 'env' },
      `vercelEnv=${String(vercelEnv)}`,
    )
    assert.deepStrictEqual(readConfig({ vercelEnv, knownHook: OTHER, knownBic: OTHER }), {
      state: 'unconfigured',
      reason: 'unset',
    })
  }
})

// --- 4. verifyDeployment -----------------------------------------------------

const CODE = '0x6080604052348015600e575f5ffd5b50'

/** Every read answering as the RUNBOOK expects. */
const GOOD_READS = Object.freeze({
  rpcChainId: 1,
  hookCode: CODE,
  bicCode: CODE,
  tokenA: NFD_ADDRESS,
  tokenB: BIC,
  poolManager: POOL_MANAGER,
  owner: COMMUNITY_MULTISIG,
  bicSymbol: 'BIC',
  bicDecimals: 18,
  bicTotalSupply: BIC_TOTAL_SUPPLY,
  bicTreasury: COMMUNITY_MULTISIG,
  nfdSymbol: 'NFD',
  nfdDecimals: 18,
})
const EXPECTED = Object.freeze({ bic: BIC })

/** One plausible wrong answer per read: the testnet, an empty account, the other token, a lower-cased symbol... */
const WRONG_READS = Object.freeze({
  rpcChainId: 11155111,
  hookCode: '0x',
  bicCode: '0x',
  tokenA: BIC,
  tokenB: NFD_ADDRESS,
  poolManager: HOOK,
  owner: HOOK,
  bicSymbol: 'bic',
  bicDecimals: 6,
  bicTotalSupply: BIC_TOTAL_SUPPLY - 1n,
  bicTreasury: HOOK,
  nfdSymbol: 'NFD ',
  nfdDecimals: 6,
})

/** The read field and the check key agree except for the supply row. */
const checkKeyOf = (field) => (field === 'bicTotalSupply' ? 'bicSupply' : field)

const failedKeys = (verification, state) =>
  verification.checks.filter((c) => c.ok === state).map((c) => c.key)

test('verifyDeployment: the all-correct fixture passes all thirteen, in render order', () => {
  const v = verifyDeployment(GOOD_READS, EXPECTED)
  assert.equal(v.ok, true)
  assert.equal(v.checks.length, 13)
  assert.ok(v.checks.every((c) => c.ok === true))
  assert.deepStrictEqual(
    v.checks.map(({ key, label }) => ({ key, label })),
    [...VERIFICATION_CHECKS],
    'checks come back in VERIFICATION_CHECKS order with their labels',
  )
  assert.equal(VERIFICATION_CHECKS.length, 13)
  assert.equal(new Set(VERIFICATION_CHECKS.map((c) => c.key)).size, 13, 'keys are unique')
  assert.ok(VERIFICATION_CHECKS.every((c) => typeof c.label === 'string' && c.label.length > 0))
  assert.ok(Object.isFrozen(VERIFICATION_CHECKS))
  // The one label whose number a reader will compare against Etherscan.
  assert.equal(
    VERIFICATION_CHECKS.find((c) => c.key === 'bicSupply').label,
    'BIC supply is 100,000,000,000',
  )
})

test('verifyDeployment: each read wrong in turn fails exactly its own row', () => {
  assert.deepStrictEqual(
    Object.keys(WRONG_READS),
    Object.keys(GOOD_READS),
    'every read has a wrong answer to try',
  )
  for (const [field, bad] of Object.entries(WRONG_READS)) {
    const v = verifyDeployment({ ...GOOD_READS, [field]: bad }, EXPECTED)
    assert.equal(v.ok, false, field)
    assert.deepStrictEqual(failedKeys(v, false), [checkKeyOf(field)], `${field} = ${String(bad)}`)
    assert.deepStrictEqual(
      failedKeys(v, null),
      [],
      `${field}: a wrong answer is a failure, not an unread row`,
    )
  }
})

test('verifyDeployment: null is a failed call, undefined is a row not read yet', () => {
  for (const field of Object.keys(GOOD_READS)) {
    const nulled = verifyDeployment({ ...GOOD_READS, [field]: null }, EXPECTED)
    assert.equal(nulled.ok, false, `${field}: null`)
    assert.deepStrictEqual(
      failedKeys(nulled, false),
      [checkKeyOf(field)],
      `${field}: null fails that row`,
    )
    assert.deepStrictEqual(failedKeys(nulled, null), [], `${field}: null is not "unread"`)

    const unread = verifyDeployment({ ...GOOD_READS, [field]: undefined }, EXPECTED)
    assert.equal(unread.ok, false, `${field}: undefined`)
    assert.deepStrictEqual(
      failedKeys(unread, null),
      [checkKeyOf(field)],
      `${field}: undefined is that row unread`,
    )
    assert.deepStrictEqual(failedKeys(unread, false), [], `${field}: unread is not a failure`)
  }
  const nothing = verifyDeployment()
  assert.equal(nothing.ok, false)
  assert.ok(
    nothing.checks.every((c) => c.ok === null),
    'nothing read: every row is pending, none has failed',
  )
  assert.equal(nothing.checks.length, 13)
})

test('verifyDeployment: addresses compare case-insensitively; symbols, code and supply do not bend', () => {
  const flip = (a) => a.toUpperCase().replace('0X', '0x')
  const recased = {
    ...GOOD_READS,
    tokenA: NFD_ADDRESS.toLowerCase(),
    tokenB: flip(BIC),
    poolManager: POOL_MANAGER.toLowerCase(),
    owner: flip(COMMUNITY_MULTISIG),
    bicTreasury: COMMUNITY_MULTISIG.toLowerCase(),
  }
  assert.equal(verifyDeployment(recased, { bic: BIC.toLowerCase() }).ok, true)

  for (const bicSymbol of ['bic', 'BIC ', ' BIC', 'B1C', 'Bic']) {
    assert.deepStrictEqual(
      failedKeys(verifyDeployment({ ...GOOD_READS, bicSymbol }, EXPECTED), false),
      ['bicSymbol'],
      JSON.stringify(bicSymbol),
    )
  }
  for (const nfdSymbol of ['nfd', 'NFD ', 'Feisty Doge']) {
    assert.deepStrictEqual(
      failedKeys(verifyDeployment({ ...GOOD_READS, nfdSymbol }, EXPECTED), false),
      ['nfdSymbol'],
      JSON.stringify(nfdSymbol),
    )
  }
  for (const code of ['0x', '', '0X']) {
    assert.deepStrictEqual(
      failedKeys(verifyDeployment({ ...GOOD_READS, hookCode: code }, EXPECTED), false),
      ['hookCode'],
      JSON.stringify(code),
    )
    assert.deepStrictEqual(
      failedKeys(verifyDeployment({ ...GOOD_READS, bicCode: code }, EXPECTED), false),
      ['bicCode'],
      JSON.stringify(code),
    )
  }
  // A supply that arrives as a Number is not the supply, even when it is "equal".
  assert.deepStrictEqual(
    failedKeys(
      verifyDeployment({ ...GOOD_READS, bicTotalSupply: Number(BIC_TOTAL_SUPPLY) }, EXPECTED),
      false,
    ),
    ['bicSupply'],
  )
  // Decimals as a string are not decimals.
  assert.deepStrictEqual(
    failedKeys(verifyDeployment({ ...GOOD_READS, bicDecimals: '18' }, EXPECTED), false),
    ['bicDecimals'],
  )
  // The chain id has to be mainnet's, as a number.
  assert.deepStrictEqual(
    failedKeys(verifyDeployment({ ...GOOD_READS, rpcChainId: '1' }, EXPECTED), false),
    ['rpcChainId'],
  )
  // tokenB is checked against the CONFIGURED BIC, so no configured BIC means no pass.
  assert.deepStrictEqual(failedKeys(verifyDeployment(GOOD_READS, {}), false), ['tokenB'])
  assert.deepStrictEqual(failedKeys(verifyDeployment(GOOD_READS, { bic: OTHER }), false), [
    'tokenB',
  ])
})

// --- 5. isConsistent ---------------------------------------------------------

test('isConsistent: inventory within BIC supply and escrow within NFD supply, inclusive', () => {
  const base = {
    inventoryB: tokens(10n),
    escrowedA: tokens(10n),
    bicTotalSupply: BIC_TOTAL_SUPPLY,
    nfdTotalSupply: tokens(100n),
  }
  assert.equal(isConsistent(base), true)
  assert.equal(
    isConsistent({ ...base, inventoryB: BIC_TOTAL_SUPPLY }),
    true,
    'equal to the supply is possible',
  )
  assert.equal(
    isConsistent({ ...base, inventoryB: BIC_TOTAL_SUPPLY + 1n }),
    false,
    'more BIC than exists is a wrong contract or node',
  )
  assert.equal(isConsistent({ ...base, escrowedA: tokens(100n) }), true)
  assert.equal(
    isConsistent({ ...base, escrowedA: tokens(100n) + 1n }),
    false,
    'more NFD than exists',
  )
  assert.equal(isConsistent({ ...base, inventoryB: ZERO, escrowedA: ZERO }), true)
  for (const key of Object.keys(base)) {
    assert.equal(isConsistent({ ...base, [key]: null }), false, `${key} unread is not consistent`)
    assert.equal(
      isConsistent({ ...base, [key]: undefined }),
      false,
      `${key} missing is not consistent`,
    )
  }
  assert.equal(isConsistent({ ...base, inventoryB: 10 }), false, 'a Number is not a reading')
})

// --- 6. classifyAmount -------------------------------------------------------

test('classifyAmount: the precedence matrix', () => {
  const fine = {
    direction: 'forward',
    amount: tokens(5n),
    balance: tokens(10n),
    cap: tokens(10n),
    paused: false,
  }
  assert.equal(classifyAmount(fine), 'ok')

  // paused first, and forward only — the contract cannot pause the reverse.
  assert.equal(classifyAmount({ ...fine, paused: true }), 'paused')
  assert.equal(
    classifyAmount({ ...fine, paused: true, amount: null, balance: null, cap: null }),
    'paused',
  )
  assert.equal(classifyAmount({ ...fine, paused: true, amount: tokens(50n) }), 'paused')
  assert.equal(classifyAmount({ ...fine, direction: 'reverse', paused: true }), 'ok')
  assert.equal(
    classifyAmount({ ...fine, direction: 'reverse', paused: true, amount: tokens(50n) }),
    'exceeds-balance',
  )
  for (const paused of [null, undefined, false]) {
    assert.equal(classifyAmount({ ...fine, paused }), 'ok', `paused=${String(paused)}`)
  }

  // zero beats unread: nothing typed needs no figures.
  for (const amount of [null, undefined, ZERO, 0, '5']) {
    assert.equal(
      classifyAmount({ ...fine, amount, balance: null, cap: null }),
      'zero',
      `amount=${String(amount)}`,
    )
    assert.equal(
      classifyAmount({ ...fine, amount }),
      'zero',
      `amount=${String(amount)} with figures`,
    )
  }

  // unread: either figure missing.
  assert.equal(classifyAmount({ ...fine, balance: null }), 'unread')
  assert.equal(classifyAmount({ ...fine, cap: null }), 'unread')
  assert.equal(classifyAmount({ ...fine, cap: undefined }), 'unread')
  assert.equal(
    classifyAmount({ ...fine, balance: 10 }),
    'unread',
    'a Number balance is not a reading',
  )
  assert.equal(
    classifyAmount({ ...fine, balance: null, amount: tokens(50n) }),
    'unread',
    'unread before exceeds',
  )

  // balance before cap; equality is ok on both.
  assert.equal(classifyAmount({ ...fine, amount: tokens(11n) }), 'exceeds-balance')
  assert.equal(
    classifyAmount({ ...fine, amount: tokens(11n), cap: tokens(1n) }),
    'exceeds-balance',
    'over both: the balance is named first',
  )
  assert.equal(classifyAmount({ ...fine, amount: tokens(5n), cap: tokens(4n) }), 'exceeds-cap')
  assert.equal(classifyAmount({ ...fine, amount: tokens(10n) }), 'ok', 'amount == balance == cap')
  assert.equal(
    classifyAmount({ ...fine, amount: tokens(10n), cap: tokens(20n) }),
    'ok',
    'amount == balance',
  )
  assert.equal(
    classifyAmount({ ...fine, amount: tokens(10n), balance: tokens(20n) }),
    'ok',
    'amount == cap',
  )
  assert.equal(
    classifyAmount({ ...fine, amount: tokens(10n) + 1n, cap: tokens(20n) }),
    'exceeds-balance',
    'one raw unit over the balance',
  )
  assert.equal(
    classifyAmount({ ...fine, amount: tokens(10n) + 1n, balance: tokens(20n) }),
    'exceeds-cap',
    'one raw unit over the cap',
  )
  // Same matrix, reverse direction.
  assert.equal(
    classifyAmount({ ...fine, direction: 'reverse', amount: tokens(11n) }),
    'exceeds-balance',
  )
  assert.equal(
    classifyAmount({ ...fine, direction: 'reverse', amount: tokens(5n), cap: tokens(4n) }),
    'exceeds-cap',
  )
  assert.equal(classifyAmount({ ...fine, direction: 'reverse', balance: null }), 'unread')
})

test('tokenIn and tokenOut name the pair for each direction', () => {
  assert.equal(tokenIn('forward'), 'NFD')
  assert.equal(tokenOut('forward'), 'BIC')
  assert.equal(tokenIn('reverse'), 'BIC')
  assert.equal(tokenOut('reverse'), 'NFD')
  assert.equal(NFD_SYMBOL, 'NFD')
  assert.equal(BIC_SYMBOL, 'BIC')
})

// --- 7. needsApproval, planSteps, maxAmount ----------------------------------

test('needsApproval and planSteps: the boundary is "allowance < amount"', () => {
  assert.equal(needsApproval(tokens(5n), tokens(5n)), false, 'exactly enough needs nothing')
  assert.equal(needsApproval(tokens(6n), tokens(5n)), false)
  assert.equal(needsApproval(tokens(5n) - 1n, tokens(5n)), true, 'one raw unit short')
  assert.equal(needsApproval(ZERO, 1n), true)
  assert.equal(needsApproval(null, 1n), true, 'an unread allowance is not an allowance')
  assert.equal(needsApproval(undefined, 1n), true)
  assert.equal(needsApproval(5, 1n), true, 'a Number is not an allowance')

  assert.deepStrictEqual(planSteps({ allowance: tokens(5n), amount: tokens(5n) }), ['send'])
  assert.deepStrictEqual(planSteps({ allowance: tokens(50n), amount: tokens(5n) }), ['send'])
  assert.deepStrictEqual(planSteps({ allowance: tokens(5n) - 1n, amount: tokens(5n) }), [
    'approve',
    'send',
  ])
  assert.deepStrictEqual(planSteps({ allowance: ZERO, amount: tokens(5n) }), ['approve', 'send'])
  assert.deepStrictEqual(planSteps({ allowance: null, amount: tokens(5n) }), ['approve', 'send'])
})

test('maxAmount: the smaller side, the balance on a tie, null when either is unread', () => {
  assert.deepStrictEqual(maxAmount({ balance: tokens(3n), cap: tokens(10n) }), {
    value: tokens(3n),
    cappedBy: 'balance',
  })
  assert.deepStrictEqual(maxAmount({ balance: tokens(10n), cap: tokens(3n) }), {
    value: tokens(3n),
    cappedBy: 'cap',
  })
  assert.deepStrictEqual(maxAmount({ balance: tokens(3n), cap: tokens(3n) }), {
    value: tokens(3n),
    cappedBy: 'balance',
  })
  assert.deepStrictEqual(maxAmount({ balance: tokens(3n), cap: tokens(3n) + 1n }), {
    value: tokens(3n),
    cappedBy: 'balance',
  })
  assert.deepStrictEqual(maxAmount({ balance: tokens(3n) + 1n, cap: tokens(3n) }), {
    value: tokens(3n),
    cappedBy: 'cap',
  })
  assert.deepStrictEqual(maxAmount({ balance: ZERO, cap: tokens(3n) }), {
    value: ZERO,
    cappedBy: 'balance',
  })
  assert.equal(maxAmount({ balance: null, cap: tokens(3n) }), null)
  assert.equal(maxAmount({ balance: tokens(3n), cap: null }), null)
  assert.equal(maxAmount({ balance: undefined, cap: undefined }), null)
  assert.equal(maxAmount({ balance: 3, cap: tokens(3n) }), null, 'a Number is not a reading')
})

// --- 8. capAdvice ------------------------------------------------------------

test('capAdvice: the §9 sentences, with the exact cap, and null when the amount fits', () => {
  const cap = 1234567n * 10n ** 14n // 123.4567 — exact, not grouped, not rounded
  assert.equal(
    capAdvice({ direction: 'forward', amount: tokens(200n), cap }),
    'The contract can pay out 123.4567 BIC in one transaction right now. ' +
      'Split it: migrate 123.4567 now and the rest after the inventory is topped up. ' +
      'Nothing is lost by splitting — the rate is one for one every time.',
  )
  assert.equal(
    capAdvice({ direction: 'reverse', amount: tokens(200n), cap }),
    'The escrow holds 123.4567 NFD right now. Only NFD that came in through a migration ' +
      'is in the escrow, so BIC bought elsewhere can exceed it. Split it: redeem up to 123.4567 now.',
  )
  for (const direction of ['forward', 'reverse']) {
    const advice = capAdvice({ direction, amount: tokens(200n), cap })
    assert.ok(advice.includes(formatAmountExact(cap)), `${direction} names the exact cap`)
    assert.match(advice, /split/i, `${direction} says to split`)
    assert.ok(advice.includes(tokenOut(direction)), `${direction} names the token paid out`)
    // A big cap is exact, never grouped: the chip fills the input with this number.
    assert.ok(
      capAdvice({ direction, amount: BIC_TOTAL_SUPPLY, cap: 15_000_000_000n * ONE_TOKEN }).includes(
        '15000000000 ',
      ),
      `${direction} exact`,
    )
    assert.equal(
      capAdvice({ direction, amount: cap, cap }),
      null,
      `${direction}: equal to the cap fits`,
    )
    assert.equal(
      capAdvice({ direction, amount: cap - 1n, cap }),
      null,
      `${direction}: under the cap fits`,
    )
    assert.equal(
      capAdvice({ direction, amount: null, cap }),
      null,
      `${direction}: no amount, no advice`,
    )
    assert.equal(
      capAdvice({ direction, amount: tokens(200n), cap: null }),
      null,
      `${direction}: no cap read, no advice`,
    )
    assert.equal(
      capAdvice({ direction, amount: 200, cap }),
      null,
      `${direction}: a Number is not an amount`,
    )
  }
  assert.notEqual(
    capAdvice({ direction: 'forward', amount: tokens(200n), cap }),
    capAdvice({ direction: 'reverse', amount: tokens(200n), cap }),
  )
})

// --- 9. the failure copy -----------------------------------------------------

test('PAUSED_SENTENCE is the banner sentence, verbatim', () => {
  assert.equal(
    PAUSED_SENTENCE,
    'The community multisig has stopped new NFD → BIC migrations for now — usually because ' +
      'the NFD vault is in an auction. BIC → NFD still works; the contract cannot pause it.',
  )
})

test('describeRevert: every named error in plain words, verbatim', () => {
  const five = tokens(5n)
  const seven = tokens(7n)
  assert.equal(
    describeRevert('SwapsPaused', [], 'forward'),
    `Forward migration is paused. ${PAUSED_SENTENCE}`,
  )
  assert.equal(
    describeRevert('InsufficientInventory', [five, seven], 'forward'),
    'The contract can pay out 5 BIC in one transaction right now and you asked for 7. ' +
      'Split it: migrate 5 now and the rest after the inventory is topped up. Nothing was taken.',
  )
  assert.equal(
    describeRevert('InsufficientEscrowBalance', [five, seven], 'reverse'),
    'The escrow holds 5 NFD right now and you asked for 7. Only NFD that came in through a migration ' +
      'is in the escrow, so BIC bought elsewhere can exceed it. Redeem up to 5 now.',
  )
  // Both numbers are printed exactly, in (available, required) order.
  const exact = describeRevert(
    'InsufficientInventory',
    [1999999999999999999n, BIC_TOTAL_SUPPLY],
    'forward',
  )
  assert.ok(exact.includes('pay out 1.999999999999999999 BIC'))
  assert.ok(exact.includes('asked for 100000000000.'))
  assert.equal(
    describeRevert('ZeroAddress', [], 'forward'),
    'The contract refused a zero recipient. This page always sends to the account you connected, ' +
      'so this should be impossible — stop and report it.',
  )
  assert.equal(
    describeRevert('TransferFromFailed', [], 'forward'),
    'The token refused the transfer. Usually the allowance or the balance changed since this page ' +
      'last looked. Reload and try again.',
  )
  assert.equal(
    describeRevert('SettlementMismatch', [five, seven], 'forward'),
    'The token moved a different amount than requested, which means it is not behaving like a ' +
      'plain ERC-20. Stop; do not retry; report it.',
  )
  for (const name of [
    'Reentrancy',
    'Unauthorized',
    'NotPoolManager',
    'TokensMustDiffer',
    'UnknownUnlockOperation',
  ]) {
    assert.equal(
      describeRevert(name, [], 'forward'),
      `The contract refused: ${name}. Nothing moved.`,
    )
  }
  // The token's own errors name the token being taken, which depends on direction.
  for (const name of ['ERC20InsufficientAllowance', 'ERC20InsufficientBalance']) {
    assert.equal(
      describeRevert(name, [], 'forward'),
      'NFD refused: the allowance (or balance) is short. Reload and try again.',
    )
    assert.equal(
      describeRevert(name, [], 'reverse'),
      'BIC refused: the allowance (or balance) is short. Reload and try again.',
    )
  }
  assert.equal(
    describeRevert('Error', ['ERC20: transfer amount exceeds balance'], 'forward'),
    'NFD refused: ERC20: transfer amount exceeds balance.',
  )
  assert.equal(
    describeRevert('Error', ['ERC20: transfer amount exceeds balance'], 'reverse'),
    'BIC refused: ERC20: transfer amount exceeds balance.',
  )
  assert.equal(describeRevert('Error', [], 'forward'), 'NFD refused: no reason given.')
})

test('describeRevert never throws: unknown names, missing args, odd arg shapes', () => {
  assert.equal(
    describeRevert('SomethingNew', undefined, 'forward'),
    'The contract refused: SomethingNew. Nothing moved.',
  )
  assert.equal(
    describeRevert(undefined, undefined, 'forward'),
    'The contract refused: unknown error. Nothing moved.',
  )
  assert.equal(
    describeRevert('', null, 'reverse'),
    'The contract refused: unknown error. Nothing moved.',
  )
  assert.doesNotThrow(() => describeRevert('InsufficientInventory', undefined, 'forward'))
  assert.doesNotThrow(() => describeRevert('InsufficientEscrowBalance', 'not-an-array', 'reverse'))
  assert.doesNotThrow(() => describeRevert('Error', undefined, 'forward'))
  assert.match(describeRevert('InsufficientInventory', 'not-an-array', 'forward'), /Split it/)
  // Arguments that are not bigints are printed as given rather than refused.
  assert.match(
    describeRevert('InsufficientInventory', ['5', 7], 'forward'),
    /pay out 5 BIC .* asked for 7\./,
  )
})

test("describeWalletError: the EIP-1193 codes, and the fallback that keeps the wallet's words", () => {
  assert.equal(describeWalletError(4001), 'You declined in your wallet. Nothing was sent.')
  assert.equal(
    describeWalletError(4001, 'User rejected the request.'),
    'You declined in your wallet. Nothing was sent.',
  )
  assert.equal(
    describeWalletError(-32002),
    'Your wallet already has a request open. Find it in the wallet window.',
  )
  assert.equal(describeWalletError(4900), 'Your wallet is not on Ethereum mainnet.')
  assert.equal(describeWalletError(4901), 'Your wallet is not on Ethereum mainnet.')
  assert.equal(
    describeWalletError(4902),
    'Your wallet has no Ethereum mainnet entry. Add it in the wallet, not here.',
  )
  assert.equal(describeWalletError(-32603, 'Gas estimation failed.'), 'Gas estimation failed.')
  assert.equal(describeWalletError(-32603, 'Execution reverted'), 'Execution reverted.')
  const generic = 'The wallet returned an error.'
  assert.equal(describeWalletError(-32603), generic)
  assert.equal(describeWalletError(null), generic)
  assert.equal(describeWalletError(undefined, ''), generic)
})

test('describeReceipt: mined, or reverted with the recovered cause', () => {
  assert.equal(describeReceipt({ status: 'success' }), 'Mined.')
  const reverted = 'The transaction was mined but reverted, so no tokens moved; the gas was spent. '
  assert.equal(
    describeReceipt({ status: 'reverted', reason: 'InsufficientInventory' }),
    `${reverted}Likely cause: InsufficientInventory`,
  )
  const guess = `${reverted}Most likely the available amount changed while the transaction waited.`
  assert.equal(describeReceipt({ status: 'reverted' }), guess)
  assert.equal(describeReceipt({ status: 'reverted', reason: null }), guess)
  assert.equal(describeReceipt({ status: 'reverted', reason: '' }), guess)
  assert.equal(describeReceipt(), guess, 'no status is not a success')
})

test('describeEventMismatch: what was asked, what was seen, and the instruction to stop', () => {
  assert.equal(
    describeEventMismatch({
      expectedTo: ACCOUNT,
      actualTo: OTHER,
      expectedAmount: tokens(5n),
      actualAmount: tokens(7n),
    }),
    'The transaction was mined but its event does not match what this page asked for ' +
      `(expected 5 to ${ACCOUNT}, saw 7 to ${OTHER}). Stop, do not retry, and report it with the hash.`,
  )
  for (const actualTo of [null, undefined]) {
    const text = describeEventMismatch({
      expectedTo: ACCOUNT,
      actualTo,
      expectedAmount: tokens(5n),
      actualAmount: tokens(5n),
    })
    assert.ok(text.includes('saw 5 to nobody)'), 'a missing recipient reads as nobody')
    assert.ok(text.includes(`expected 5 to ${ACCOUNT}`))
  }
  // Exact amounts, so a one-unit discrepancy is visible.
  assert.ok(
    describeEventMismatch({
      expectedTo: ACCOUNT,
      actualTo: ACCOUNT,
      expectedAmount: tokens(5n),
      actualAmount: tokens(5n) - 1n,
    }).includes('expected 5 to'),
  )
  assert.ok(
    describeEventMismatch({
      expectedTo: ACCOUNT,
      actualTo: ACCOUNT,
      expectedAmount: tokens(5n),
      actualAmount: tokens(5n) - 1n,
    }).includes('saw 4.999999999999999999 to'),
  )
})

test('describeReplacement: the two ways a wallet can take a transaction back', () => {
  assert.equal(
    describeReplacement('cancelled'),
    'You cancelled the transaction in your wallet before it was mined.',
  )
  assert.equal(
    describeReplacement('replaced'),
    'A different transaction replaced this one in your wallet before it was mined. Nothing from ' +
      'this page was sent in its place — check it on Etherscan.',
  )
  assert.equal(
    describeReplacement('anything-else'),
    describeReplacement('replaced'),
    'unknown reasons read as replaced',
  )
})

// --- 10. the flow ------------------------------------------------------------

const FLOW_ID = 'flow-1'
const ev = (type, extra = {}) => ({ type, id: FLOW_ID, ...extra })
const start = (direction = 'forward') =>
  ev('START', { direction, amount: AMOUNT, account: ACCOUNT })
const walk = (events, from = initialFlow()) =>
  events.reduce((flow, event) => flowReducer(flow, event), from)

/** The event list that reaches each step, so a test can start anywhere. */
function pathTo(name, direction = 'forward') {
  const approvePending = [
    start(direction),
    ev('APPROVE_PROMPT'),
    ev('APPROVE_SENT', { hash: H1, at: 1_000 }),
  ]
  const approved = [...approvePending, ev('APPROVE_MINED', { hash: H1, allowance: AMOUNT })]
  const sendPending = [
    ...approved,
    start(direction),
    ev('SEND_PROMPT'),
    ev('SEND_SENT', { hash: H3, at: 2_000 }),
  ]
  const paths = {
    idle: [],
    checking: [start(direction)],
    'approve-sign': [start(direction), ev('APPROVE_PROMPT')],
    'approve-pending': approvePending,
    approved,
    'send-sign': [...approved, start(direction), ev('SEND_PROMPT')],
    'send-pending': sendPending,
    mined: [
      ...sendPending,
      ev('SEND_MINED', { hash: H3, to: ACCOUNT, amount: AMOUNT, blockNumber: 123n }),
    ],
    failed: [
      start(direction),
      ev('CHECK_FAILED', {
        message: 'Could not re-check the contract before sending. Nothing was sent.',
      }),
    ],
    aborted: [start(direction), { type: 'ABORT' }],
    'stalled-approve': [...approvePending, ev('RELEASE')],
    'stalled-send': [...sendPending, ev('RELEASE')],
  }
  assert.ok(name in paths, `no path to ${name}`)
  return paths[name]
}
const reach = (name, direction) => walk(pathTo(name, direction))
const STATES = Object.keys({
  idle: 1,
  checking: 1,
  'approve-sign': 1,
  'approve-pending': 1,
  approved: 1,
  'send-sign': 1,
  'send-pending': 1,
  mined: 1,
  failed: 1,
  aborted: 1,
  'stalled-approve': 1,
  'stalled-send': 1,
})
const stepOf = (name) => (name.startsWith('stalled') ? 'stalled' : name)
const IN_FLIGHT_STATES = [
  'checking',
  'approve-sign',
  'approve-pending',
  'approved',
  'send-sign',
  'send-pending',
  'stalled-approve',
  'stalled-send',
]
const SETTLED_STATES = ['idle', 'mined', 'failed', 'aborted']

/** One well-formed event of every type, all for FLOW_ID. */
const EVENTS = Object.freeze({
  START: start(),
  CHECK_FAILED: ev('CHECK_FAILED', { message: 'nope' }),
  APPROVE_PROMPT: ev('APPROVE_PROMPT'),
  APPROVE_SENT: ev('APPROVE_SENT', { hash: H1, at: 1 }),
  APPROVE_REPLACED: ev('APPROVE_REPLACED', { hash: H2, reason: 'repriced' }),
  APPROVE_MINED: ev('APPROVE_MINED', { hash: H2, allowance: AMOUNT }),
  SEND_PROMPT: ev('SEND_PROMPT'),
  SEND_SENT: ev('SEND_SENT', { hash: H3, at: 2 }),
  SEND_REPLACED: ev('SEND_REPLACED', { hash: H4, reason: 'repriced' }),
  SEND_MINED: ev('SEND_MINED', { hash: H4, to: ACCOUNT, amount: AMOUNT, blockNumber: 1n }),
  FAIL: ev('FAIL', { message: 'boom' }),
  ABORT: { type: 'ABORT' },
  RELEASE: ev('RELEASE'),
  DISMISS: { type: 'DISMISS' },
  RESET: { type: 'RESET' },
})

/** The transition table of §7, with FAIL allowed from every in-flight step (§8 fails from `checking` on a bad simulate). */
const LEGAL = Object.freeze({
  idle: ['START'],
  checking: ['CHECK_FAILED', 'APPROVE_PROMPT', 'SEND_PROMPT', 'FAIL', 'ABORT'],
  'approve-sign': ['APPROVE_SENT', 'FAIL', 'ABORT'],
  'approve-pending': ['APPROVE_REPLACED', 'APPROVE_MINED', 'FAIL', 'RELEASE', 'ABORT'],
  approved: ['START', 'FAIL', 'ABORT', 'DISMISS'],
  'send-sign': ['SEND_SENT', 'FAIL', 'ABORT'],
  'send-pending': ['SEND_REPLACED', 'SEND_MINED', 'FAIL', 'RELEASE', 'ABORT'],
  mined: ['RESET'],
  failed: ['RESET'],
  aborted: ['RESET'],
  'stalled-approve': ['APPROVE_REPLACED', 'APPROVE_MINED', 'FAIL', 'ABORT', 'DISMISS', 'RESET'],
  'stalled-send': ['SEND_REPLACED', 'SEND_MINED', 'FAIL', 'ABORT', 'DISMISS', 'RESET'],
})

const snapshotOf = (flow) => ({
  id: flow.id,
  direction: flow.direction,
  amount: flow.amount,
  account: flow.account,
})
const SNAPSHOT = Object.freeze({
  id: FLOW_ID,
  direction: 'forward',
  amount: AMOUNT,
  account: ACCOUNT,
})

test('initialFlow and isInFlight: the shape, and which steps hold the in-flight ref', () => {
  assert.deepStrictEqual(initialFlow(), {
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
  })
  assert.notEqual(initialFlow(), initialFlow(), 'a fresh object every time, so React sees a change')
  for (const name of STATES) {
    const flow = reach(name)
    assert.equal(flow.step, stepOf(name), `pathTo(${name}) lands on ${stepOf(name)}`)
    assert.equal(isInFlight(flow.step), IN_FLIGHT_STATES.includes(name), `${name} in flight`)
  }
  for (const step of ['idle', 'mined', 'failed', 'aborted'])
    assert.equal(isInFlight(step), false, step)
  assert.equal(isInFlight('nonsense'), false)
})

test('flowReducer: the full walk — approve, a repriced approval, second click, migrate, mined, reset', () => {
  const rows = [
    // [event, step, label, status, extra assertions]
    [
      start(),
      'checking',
      'Checking…',
      'Checking the contract before asking your wallet.',
      (f) => assert.equal(f.id, FLOW_ID),
    ],
    [
      ev('APPROVE_PROMPT'),
      'approve-sign',
      'Confirm in your wallet…',
      'Confirm the approval of 5 NFD in your wallet. It is for exactly that amount.',
    ],
    [
      ev('APPROVE_SENT', { hash: H1, at: 1_000 }),
      'approve-pending',
      'Waiting for Ethereum…',
      'Approval sent. Waiting for Ethereum.',
      (f) => {
        assert.equal(f.approveHash, H1)
        assert.equal(f.pendingSince, 1_000)
      },
    ],
    [
      ev('APPROVE_REPLACED', { hash: H2, reason: 'repriced' }),
      'approve-pending',
      'Waiting for Ethereum…',
      'Your wallet sped this up; following the replacement.',
      (f) => {
        assert.equal(f.approveHash, H2, 'the replacement is now the hash being watched')
        assert.deepStrictEqual(f.replaced, [
          { step: 'approve', from: H1, to: H2, reason: 'repriced' },
        ])
        assert.equal(f.pendingSince, 1_000, 'a reprice does not restart the stall clock')
      },
    ],
    [
      ev('APPROVE_MINED', { hash: H2, allowance: AMOUNT }),
      'approved',
      'Migrate 5 NFD to BIC',
      'Approved. Click again to confirm the migration in your wallet.',
      (f) => {
        assert.equal(f.approvedAllowance, AMOUNT)
        assert.equal(f.approveHash, H2)
        assert.equal(f.pendingSince, null)
        assert.equal(f.stalledFrom, null)
        assert.equal(
          describeFlow(f).disabled,
          false,
          "the second click is the user's, never automatic",
        )
      },
    ],
    [
      start(),
      'checking',
      'Checking…',
      'Checking the contract before asking your wallet.',
      (f) => {
        assert.equal(f.approveHash, H2, 'the second click keeps the approval')
        assert.equal(f.approvedAllowance, AMOUNT)
        assert.equal(f.replaced.length, 1)
      },
    ],
    [
      ev('SEND_PROMPT'),
      'send-sign',
      'Confirm in your wallet…',
      'Confirm the migration of 5 NFD in your wallet.',
    ],
    [
      ev('SEND_SENT', { hash: H3, at: 2_000 }),
      'send-pending',
      'Waiting for Ethereum…',
      // The APPROVE reprice must not make the SEND step claim it was sped up.
      'Migration sent. Waiting for Ethereum.',
      (f) => {
        assert.equal(f.sendHash, H3)
        assert.equal(f.pendingSince, 2_000)
      },
    ],
    [
      ev('SEND_MINED', { hash: H3, to: ACCOUNT, amount: AMOUNT, blockNumber: 123n }),
      'mined',
      'Migrate more',
      `Done. 5 NFD went into escrow and 5 BIC arrived in ${SHORT_ACCOUNT} — confirmed from the transaction's own event.`,
      (f) => {
        assert.deepStrictEqual(f.mined, {
          hash: H3,
          to: ACCOUNT,
          amount: AMOUNT,
          blockNumber: 123n,
        })
        assert.equal(f.pendingSince, null)
        assert.equal(f.approveHash, H2, 'the log still shows the approval')
        assert.equal(f.sendHash, H3)
        assert.equal(f.failure, null)
      },
    ],
    [
      { type: 'RESET' },
      'idle',
      'Enter an amount',
      null,
      (f) => assert.deepStrictEqual(f, initialFlow()),
    ],
  ]

  let flow = initialFlow()
  for (const [event, step, label, status, check] of rows) {
    const before = flow
    flow = flowReducer(before, event)
    assert.notEqual(flow, before, `${event.type} must produce a new object`)
    assert.equal(flow.step, step, `step after ${event.type}`)
    const described = describeFlow(flow)
    assert.equal(described.label, label, `label after ${event.type}`)
    assert.equal(described.status, status, `status after ${event.type}`)
    if (step !== 'idle')
      assert.deepStrictEqual(snapshotOf(flow), SNAPSHOT, `snapshot after ${event.type}`)
    if (check) check(flow)
  }
})

test('flowReducer: the same walk without an approval, and in reverse', () => {
  const flow = walk([
    start('reverse'),
    ev('SEND_PROMPT'),
    ev('SEND_SENT', { hash: H3, at: 2_000 }),
    ev('SEND_MINED', { hash: H3, to: ACCOUNT, amount: AMOUNT, blockNumber: 7n }),
  ])
  assert.equal(flow.step, 'mined')
  assert.equal(flow.approveHash, null, 'no approval was needed')
  assert.equal(flow.direction, 'reverse')
  assert.deepStrictEqual(describeFlow(flow), {
    label: 'Redeem more',
    disabled: false,
    status: `Done. 5 BIC went back into the inventory and 5 NFD arrived in ${SHORT_ACCOUNT} — confirmed from the transaction's own event.`,
  })
})

test('CHECK_FAILED fails the flow from checking only, with the check copy', () => {
  const message = 'Could not re-check the contract before sending. Nothing was sent.'
  const failed = flowReducer(reach('checking'), ev('CHECK_FAILED', { message }))
  assert.equal(failed.step, 'failed')
  assert.deepStrictEqual(failed.failure, { message, kind: 'check', hash: null, from: 'checking' })
  assert.deepStrictEqual(describeFlow(failed), {
    label: 'Try again',
    disabled: false,
    status: message,
  })
  assert.deepStrictEqual(snapshotOf(failed), SNAPSHOT)
  // The second click's re-check can fail too, and keeps the approval on record.
  const failedAgain = flowReducer(
    flowReducer(reach('approved'), start()),
    ev('CHECK_FAILED', { message }),
  )
  assert.equal(failedAgain.step, 'failed')
  assert.equal(failedAgain.approveHash, H1)
  for (const name of STATES.filter((n) => n !== 'checking')) {
    const flow = reach(name)
    same(flowReducer(flow, ev('CHECK_FAILED', { message })), flow, `CHECK_FAILED at ${name}`)
  }
})

test('FAIL keeps every hash already sent, records the failure, and works from every in-flight step', () => {
  const message = 'The transaction was mined but reverted, so no tokens moved; the gas was spent.'
  const failed = flowReducer(
    reach('send-pending'),
    ev('FAIL', { message, kind: 'reverted', hash: H3 }),
  )
  assert.equal(failed.step, 'failed')
  assert.equal(failed.approveHash, H1, 'the approval hash stays in the log')
  assert.equal(failed.sendHash, H3, 'the reverted hash stays in the log')
  assert.equal(failed.pendingSince, null)
  assert.deepStrictEqual(failed.failure, {
    message,
    kind: 'reverted',
    hash: H3,
    from: 'send-pending',
  })
  assert.deepStrictEqual(describeFlow(failed), {
    label: 'Try again',
    disabled: false,
    status: message,
  })
  assert.deepStrictEqual(snapshotOf(failed), SNAPSHOT)

  const declined = flowReducer(
    reach('approve-sign'),
    ev('FAIL', { message: 'You declined in your wallet. Nothing was sent.' }),
  )
  assert.deepStrictEqual(declined.failure, {
    message: 'You declined in your wallet. Nothing was sent.',
    kind: 'error',
    hash: null,
    from: 'approve-sign',
  })
  assert.equal(describeFlow(declined).status, 'You declined in your wallet. Nothing was sent.')

  for (const name of IN_FLIGHT_STATES) {
    const flow = reach(name)
    const next = flowReducer(flow, ev('FAIL', { message: 'x' }))
    assert.equal(next.step, 'failed', `FAIL at ${name}`)
    assert.equal(next.approveHash, flow.approveHash, `FAIL at ${name} keeps approveHash`)
    assert.equal(next.sendHash, flow.sendHash, `FAIL at ${name} keeps sendHash`)
    assert.deepStrictEqual(next.replaced, flow.replaced, `FAIL at ${name} keeps the replacements`)
  }
  for (const name of SETTLED_STATES) {
    const flow = reach(name)
    same(flowReducer(flow, ev('FAIL', { message: 'x' })), flow, `FAIL at ${name}`)
  }
})

test('ABORT stops every in-flight step, keeps what was sent, and does nothing to a settled flow', () => {
  const status =
    'This flow stopped because the account, the network or the contract checks changed under it. Anything already sent is still on chain — see above.'
  for (const name of IN_FLIGHT_STATES) {
    const flow = reach(name)
    const aborted = flowReducer(flow, { type: 'ABORT' })
    assert.equal(aborted.step, 'aborted', `ABORT at ${name}`)
    assert.equal(aborted.pendingSince, null, `ABORT at ${name} clears the stall clock`)
    assert.equal(aborted.approveHash, flow.approveHash, `ABORT at ${name} keeps approveHash`)
    assert.equal(aborted.sendHash, flow.sendHash, `ABORT at ${name} keeps sendHash`)
    assert.equal(aborted.failure, null, `ABORT at ${name} is not a failure`)
    assert.deepStrictEqual(snapshotOf(aborted), SNAPSHOT, `ABORT at ${name} keeps the snapshot`)
    assert.deepStrictEqual(describeFlow(aborted), { label: 'Start again', disabled: false, status })
    // The only way out is RESET.
    assert.deepStrictEqual(flowReducer(aborted, { type: 'RESET' }), initialFlow())
    same(flowReducer(aborted, { type: 'DISMISS' }), aborted)
    same(
      flowReducer(aborted, EVENTS.SEND_MINED),
      aborted,
      'a late receipt does not revive an aborted flow',
    )
  }
  for (const name of SETTLED_STATES) {
    const flow = reach(name)
    same(flowReducer(flow, { type: 'ABORT' }), flow, `ABORT at ${name}`)
  }
})

test('RELEASE parks a pending step as stalled; a late receipt or replacement still lands on it', () => {
  const stalledStatus =
    'Still pending after ten minutes. Follow it on Etherscan; it stays on chain. Do not send a second one on top of it.'

  const stalledSend = flowReducer(reach('send-pending'), ev('RELEASE'))
  assert.equal(stalledSend.step, 'stalled')
  assert.equal(stalledSend.stalledFrom, 'send')
  assert.equal(stalledSend.sendHash, H3, 'still watching the same hash')
  assert.equal(stalledSend.pendingSince, 2_000, 'the clock is kept for the record')
  assert.deepStrictEqual(describeFlow(stalledSend), {
    label: 'Still pending — follow it on Etherscan',
    disabled: true,
    status: stalledStatus,
  })

  const mined = flowReducer(
    stalledSend,
    ev('SEND_MINED', { hash: H3, to: ACCOUNT, amount: AMOUNT, blockNumber: 999n }),
  )
  assert.equal(mined.step, 'mined')
  assert.equal(mined.stalledFrom, null)
  assert.equal(mined.pendingSince, null)
  assert.deepStrictEqual(mined.mined, { hash: H3, to: ACCOUNT, amount: AMOUNT, blockNumber: 999n })
  assert.equal(describeFlow(mined).label, 'Migrate more')

  const stalledApprove = flowReducer(reach('approve-pending'), ev('RELEASE'))
  assert.equal(stalledApprove.step, 'stalled')
  assert.equal(stalledApprove.stalledFrom, 'approve')
  const approved = flowReducer(stalledApprove, ev('APPROVE_MINED', { allowance: AMOUNT }))
  assert.equal(approved.step, 'approved')
  assert.equal(approved.approveHash, H1, 'a receipt without a hash keeps the watched one')
  assert.equal(approved.stalledFrom, null)
  assert.equal(describeFlow(approved).label, 'Migrate 5 NFD to BIC')

  // A receipt for the OTHER step does not land on a stall.
  same(
    flowReducer(stalledApprove, EVENTS.SEND_MINED),
    stalledApprove,
    'a send receipt cannot finish a stalled approval',
  )
  same(
    flowReducer(stalledSend, EVENTS.APPROVE_MINED),
    stalledSend,
    'an approve receipt cannot finish a stalled migration',
  )
  same(flowReducer(stalledApprove, EVENTS.SEND_REPLACED), stalledApprove)
  same(flowReducer(stalledSend, EVENTS.APPROVE_REPLACED), stalledSend)

  // A reprice while stalled is followed, and the flow stays stalled.
  const followed = flowReducer(stalledSend, ev('SEND_REPLACED', { hash: H4, reason: 'repriced' }))
  assert.equal(followed.step, 'stalled')
  assert.equal(followed.sendHash, H4)
  assert.deepStrictEqual(followed.replaced, [
    { step: 'send', from: H3, to: H4, reason: 'repriced' },
  ])
  assert.equal(
    flowReducer(
      followed,
      ev('SEND_MINED', { hash: H4, to: ACCOUNT, amount: AMOUNT, blockNumber: 1n }),
    ).step,
    'mined',
  )

  // RELEASE only means something while a hash is pending.
  for (const name of STATES.filter((n) => !['approve-pending', 'send-pending'].includes(n))) {
    const flow = reach(name)
    same(flowReducer(flow, ev('RELEASE')), flow, `RELEASE at ${name}`)
  }
})

test('DISMISS is the explicit way out of stalled and out of approved, and only those', () => {
  for (const name of ['stalled-approve', 'stalled-send']) {
    assert.deepStrictEqual(
      flowReducer(reach(name), { type: 'DISMISS' }),
      initialFlow(),
      `DISMISS at ${name}`,
    )
    // RESET also clears a stall, so the "Migrate more"-style paths converge.
    assert.deepStrictEqual(
      flowReducer(reach(name), { type: 'RESET' }),
      initialFlow(),
      `RESET at ${name}`,
    )
  }
  // Out of "approved" the allowance stays on chain; the form shows it with Revoke.
  assert.deepStrictEqual(
    flowReducer(reach('approved'), { type: 'DISMISS' }),
    initialFlow(),
    'DISMISS at approved',
  )
  for (const name of STATES.filter((n) => !n.startsWith('stalled') && n !== 'approved')) {
    const flow = reach(name)
    same(flowReducer(flow, { type: 'DISMISS' }), flow, `DISMISS at ${name}`)
  }
})

test('RESET returns to idle from the four settled steps and nowhere else', () => {
  for (const name of ['mined', 'failed', 'aborted', 'stalled-approve', 'stalled-send']) {
    assert.deepStrictEqual(
      flowReducer(reach(name), { type: 'RESET' }),
      initialFlow(),
      `RESET at ${name}`,
    )
  }
  for (const name of [
    'idle',
    'checking',
    'approve-sign',
    'approve-pending',
    'approved',
    'send-sign',
    'send-pending',
  ]) {
    const flow = reach(name)
    same(flowReducer(flow, { type: 'RESET' }), flow, `RESET at ${name} must not drop a live flow`)
  }
})

test("a replaced or cancelled transaction fails the flow with the wallet's reason, and keeps both hashes", () => {
  for (const reason of ['replaced', 'cancelled']) {
    const failedApprove = flowReducer(
      reach('approve-pending'),
      ev('APPROVE_REPLACED', { hash: H2, reason }),
    )
    assert.equal(failedApprove.step, 'failed', reason)
    assert.deepStrictEqual(failedApprove.failure, {
      message: describeReplacement(reason),
      kind: reason,
      hash: H2,
      from: 'approve-pending',
    })
    assert.deepStrictEqual(failedApprove.replaced, [{ step: 'approve', from: H1, to: H2, reason }])
    assert.equal(
      failedApprove.approveHash,
      H1,
      'the original hash stays; the replacement is in the failure',
    )
    assert.deepStrictEqual(describeFlow(failedApprove), {
      label: 'Try again',
      disabled: false,
      status: describeReplacement(reason),
    })

    const failedSend = flowReducer(reach('send-pending'), ev('SEND_REPLACED', { hash: H4, reason }))
    assert.equal(failedSend.step, 'failed', reason)
    assert.deepStrictEqual(failedSend.failure, {
      message: describeReplacement(reason),
      kind: reason,
      hash: H4,
      from: 'send-pending',
    })
    assert.deepStrictEqual(failedSend.replaced, [{ step: 'send', from: H3, to: H4, reason }])
    assert.equal(failedSend.approveHash, H1)
    assert.equal(failedSend.sendHash, H3)

    assert.equal(
      flowReducer(reach('stalled-approve'), ev('APPROVE_REPLACED', { hash: H2, reason })).step,
      'failed',
      `${reason} while stalled`,
    )
    assert.equal(
      flowReducer(reach('stalled-send'), ev('SEND_REPLACED', { hash: H4, reason })).step,
      'failed',
      `${reason} while stalled`,
    )
  }
  // Two reprices in a row are both recorded, in order.
  const twice = walk(
    [
      ev('APPROVE_REPLACED', { hash: H2, reason: 'repriced' }),
      ev('APPROVE_REPLACED', { hash: H4, reason: 'repriced' }),
    ],
    reach('approve-pending'),
  )
  assert.equal(twice.step, 'approve-pending')
  assert.equal(twice.approveHash, H4)
  assert.deepStrictEqual(twice.replaced, [
    { step: 'approve', from: H1, to: H2, reason: 'repriced' },
    { step: 'approve', from: H2, to: H4, reason: 'repriced' },
  ])
})

test('an event from another flow is ignored and returns the identical object', () => {
  const foreign = (event) => ({ ...event, id: 'flow-0' })
  const cases = [
    ['checking', 'CHECK_FAILED'],
    ['checking', 'APPROVE_PROMPT'],
    ['checking', 'SEND_PROMPT'],
    ['checking', 'FAIL'],
    ['approve-sign', 'APPROVE_SENT'],
    ['approve-sign', 'FAIL'],
    ['approve-pending', 'APPROVE_REPLACED'],
    ['approve-pending', 'APPROVE_MINED'],
    ['approve-pending', 'FAIL'],
    ['approve-pending', 'RELEASE'],
    ['approved', 'START'],
    ['approved', 'FAIL'],
    ['send-sign', 'SEND_SENT'],
    ['send-sign', 'FAIL'],
    ['send-pending', 'SEND_REPLACED'],
    ['send-pending', 'SEND_MINED'],
    ['send-pending', 'FAIL'],
    ['send-pending', 'RELEASE'],
    ['stalled-approve', 'APPROVE_MINED'],
    ['stalled-approve', 'APPROVE_REPLACED'],
    ['stalled-approve', 'FAIL'],
    ['stalled-send', 'SEND_MINED'],
    ['stalled-send', 'SEND_REPLACED'],
    ['stalled-send', 'FAIL'],
  ]
  for (const [name, type] of cases) {
    const flow = reach(name)
    assert.notEqual(
      flowReducer(flow, EVENTS[type]),
      flow,
      `${type} on its own flow at ${name} must act`,
    )
    same(flowReducer(flow, foreign(EVENTS[type])), flow, `${type} from a foreign flow at ${name}`)
  }
  // The late-promise case the reducer exists for: the aborted flow's receipt
  // arriving after a new flow has started.
  const aborted = flowReducer(reach('send-pending'), { type: 'ABORT' })
  const fresh = flowReducer(flowReducer(aborted, { type: 'RESET' }), {
    type: 'START',
    id: 'flow-2',
    direction: 'forward',
    amount: AMOUNT,
    account: ACCOUNT,
  })
  assert.equal(fresh.id, 'flow-2')
  same(
    flowReducer(
      fresh,
      ev('SEND_MINED', { hash: H3, to: ACCOUNT, amount: AMOUNT, blockNumber: 1n }),
    ),
    fresh,
    "the old flow's receipt cannot land on the new one",
  )
  same(flowReducer(fresh, ev('FAIL', { message: 'late' })), fresh)
})

test('every illegal transition returns the same object; every legal one returns a new one', () => {
  for (const name of STATES) {
    const flow = reach(name)
    for (const [type, event] of Object.entries(EVENTS)) {
      const next = flowReducer(flow, event)
      if (LEGAL[name].includes(type)) {
        assert.notEqual(next, flow, `${type} at ${name} is legal and must produce a new object`)
      } else {
        same(next, flow, `${type} at ${name} is illegal and must return the identical object`)
      }
    }
  }
  // Coverage of the table itself: every event type is legal somewhere.
  const covered = new Set(Object.values(LEGAL).flat())
  assert.deepStrictEqual(
    [...Object.keys(EVENTS)].filter((t) => !covered.has(t)),
    [],
  )
})

test('the START snapshot survives every transition, and a second click cannot change it', () => {
  let flow = initialFlow()
  for (const event of pathTo('mined')) {
    flow = flowReducer(flow, event)
    assert.deepStrictEqual(snapshotOf(flow), SNAPSHOT, `after ${event.type}`)
  }
  for (const name of ['failed', 'aborted', 'stalled-approve', 'stalled-send']) {
    assert.deepStrictEqual(snapshotOf(reach(name)), SNAPSHOT, name)
  }

  // The second click arrives with whatever the form holds now; the flow keeps
  // what was clicked the first time.
  const approved = reach('approved')
  const again = flowReducer(
    approved,
    ev('START', { direction: 'reverse', amount: tokens(999n), account: OTHER }),
  )
  assert.equal(again.step, 'checking')
  assert.deepStrictEqual(snapshotOf(again), SNAPSHOT)
  assert.equal(
    describeFlow(again, { direction: 'reverse', amount: tokens(999n), classification: 'paused' })
      .label,
    'Checking…',
  )
  // A START with a new id while approved is somebody else's flow.
  same(
    flowReducer(approved, {
      type: 'START',
      id: 'flow-2',
      direction: 'forward',
      amount: AMOUNT,
      account: ACCOUNT,
    }),
    approved,
  )

  // Once started, the live form is not consulted for the label or the sentence.
  const live = {
    direction: 'reverse',
    amount: tokens(1n),
    classification: 'exceeds-cap',
    needsApproval: true,
  }
  assert.equal(describeFlow(approved, live).label, 'Migrate 5 NFD to BIC')
  assert.equal(
    describeFlow(reach('approve-sign'), live).status,
    'Confirm the approval of 5 NFD in your wallet. It is for exactly that amount.',
  )
  assert.equal(
    describeFlow(reach('send-sign'), live).status,
    'Confirm the migration of 5 NFD in your wallet.',
  )
  assert.deepStrictEqual(describeFlow(reach('mined'), live), describeFlow(reach('mined')))
})

test('START refuses a snapshot it cannot sign: a Number amount, a missing account or direction', () => {
  const idle = initialFlow()
  for (const bad of [
    { amount: 5 },
    { amount: '5' },
    { amount: null },
    { amount: undefined },
    { account: '' },
    { account: null },
    { direction: '' },
    { direction: null },
  ]) {
    same(
      flowReducer(idle, { ...start(), ...bad }),
      idle,
      JSON.stringify(bad, (k, v) => (typeof v === 'bigint' ? `${v}n` : v)),
    )
  }
  // A START without an id is allowed and leaves the id null.
  const anonymous = flowReducer(idle, {
    type: 'START',
    direction: 'reverse',
    amount: AMOUNT,
    account: ACCOUNT,
  })
  assert.equal(anonymous.step, 'checking')
  assert.equal(anonymous.id, null)
  // The reducer does not throw on garbage; it returns the flow untouched.
  for (const garbage of [null, undefined, {}, { type: 42 }, { type: null }, 'START']) {
    same(flowReducer(idle, garbage), idle, String(garbage))
  }
  const checking = reach('checking')
  same(flowReducer(checking, ev('NOT_A_THING')), checking)
})

test('describeFlow while idle: the label comes from the live form, one per classification', () => {
  const idle = initialFlow()
  const disabledLabels = [
    ['paused', 'Forward migration is paused'],
    ['unread', 'Figures not read yet'],
    ['exceeds-balance', 'More than this account holds'],
    ['exceeds-cap', 'More than the contract can pay out in one go'],
    ['zero', 'Enter an amount'],
    [null, 'Enter an amount'],
    [undefined, 'Enter an amount'],
  ]
  for (const direction of ['forward', 'reverse']) {
    for (const [classification, label] of disabledLabels) {
      for (const needsApprovalNow of [true, false]) {
        assert.deepStrictEqual(
          describeFlow(idle, {
            direction,
            amount: AMOUNT,
            classification,
            needsApproval: needsApprovalNow,
          }),
          { label, disabled: true, status: null },
          `${direction} ${String(classification)} needsApproval=${needsApprovalNow}`,
        )
      }
    }
  }
  assert.deepStrictEqual(
    describeFlow(idle, {
      direction: 'forward',
      amount: AMOUNT,
      classification: 'ok',
      needsApproval: true,
    }),
    { label: 'Approve 5 NFD', disabled: false, status: null },
  )
  assert.deepStrictEqual(
    describeFlow(idle, {
      direction: 'forward',
      amount: AMOUNT,
      classification: 'ok',
      needsApproval: false,
    }),
    { label: 'Migrate 5 NFD to BIC', disabled: false, status: null },
  )
  assert.deepStrictEqual(
    describeFlow(idle, {
      direction: 'reverse',
      amount: AMOUNT,
      classification: 'ok',
      needsApproval: true,
    }),
    { label: 'Approve 5 BIC', disabled: false, status: null },
  )
  assert.deepStrictEqual(
    describeFlow(idle, {
      direction: 'reverse',
      amount: AMOUNT,
      classification: 'ok',
      needsApproval: false,
    }),
    { label: 'Redeem 5 BIC for NFD', disabled: false, status: null },
  )
  assert.deepStrictEqual(describeFlow(idle), {
    label: 'Enter an amount',
    disabled: true,
    status: null,
  })
  assert.deepStrictEqual(describeFlow(idle, {}), {
    label: 'Enter an amount',
    disabled: true,
    status: null,
  })
  // The amount in the label is exact: never grouped, never rounded, never "≈".
  assert.equal(
    describeFlow(idle, {
      direction: 'forward',
      amount: 1999999999999999999n,
      classification: 'ok',
      needsApproval: false,
    }).label,
    'Migrate 1.999999999999999999 NFD to BIC',
  )
  assert.equal(
    describeFlow(idle, {
      direction: 'reverse',
      amount: 15_000_000_000n * ONE_TOKEN,
      classification: 'ok',
      needsApproval: true,
    }).label,
    'Approve 15000000000 BIC',
  )
})

test('describeFlow: the sentence table for every step, both directions', () => {
  const stalled = [
    'Still pending — follow it on Etherscan',
    true,
    'Still pending after ten minutes. Follow it on Etherscan; it stays on chain. Do not send a second one on top of it.',
  ]
  const forward = {
    checking: ['Checking…', true, 'Checking the contract before asking your wallet.'],
    'approve-sign': [
      'Confirm in your wallet…',
      true,
      'Confirm the approval of 5 NFD in your wallet. It is for exactly that amount.',
    ],
    'approve-pending': ['Waiting for Ethereum…', true, 'Approval sent. Waiting for Ethereum.'],
    approved: [
      'Migrate 5 NFD to BIC',
      false,
      'Approved. Click again to confirm the migration in your wallet.',
    ],
    'send-sign': [
      'Confirm in your wallet…',
      true,
      'Confirm the migration of 5 NFD in your wallet.',
    ],
    'send-pending': ['Waiting for Ethereum…', true, 'Migration sent. Waiting for Ethereum.'],
    mined: [
      'Migrate more',
      false,
      `Done. 5 NFD went into escrow and 5 BIC arrived in ${SHORT_ACCOUNT} — confirmed from the transaction's own event.`,
    ],
    failed: [
      'Try again',
      false,
      'Could not re-check the contract before sending. Nothing was sent.',
    ],
    aborted: [
      'Start again',
      false,
      'This flow stopped because the account, the network or the contract checks changed under it. Anything already sent is still on chain — see above.',
    ],
    'stalled-approve': stalled,
    'stalled-send': stalled,
  }
  const reverse = {
    ...forward,
    'approve-sign': [
      'Confirm in your wallet…',
      true,
      'Confirm the approval of 5 BIC in your wallet. It is for exactly that amount.',
    ],
    approved: [
      'Redeem 5 BIC for NFD',
      false,
      'Approved. Click again to confirm the redemption in your wallet.',
    ],
    'send-sign': [
      'Confirm in your wallet…',
      true,
      'Confirm redeeming 5 BIC for NFD in your wallet.',
    ],
    mined: [
      'Redeem more',
      false,
      `Done. 5 BIC went back into the inventory and 5 NFD arrived in ${SHORT_ACCOUNT} — confirmed from the transaction's own event.`,
    ],
  }
  for (const [direction, table] of [
    ['forward', forward],
    ['reverse', reverse],
  ]) {
    assert.deepStrictEqual(
      Object.keys(table).sort(),
      STATES.filter((n) => n !== 'idle').sort(),
      `${direction} table covers every step`,
    )
    for (const [name, [label, disabled, status]] of Object.entries(table)) {
      assert.deepStrictEqual(
        describeFlow(reach(name, direction)),
        { label, disabled, status },
        `${direction} ${name}`,
      )
    }
  }
  // The repriced sentence, on the step that was repriced and not the other.
  const sped = 'Your wallet sped this up; following the replacement.'
  for (const direction of ['forward', 'reverse']) {
    const approveRepriced = flowReducer(
      reach('approve-pending', direction),
      EVENTS.APPROVE_REPLACED,
    )
    assert.equal(describeFlow(approveRepriced).status, sped, `${direction} approve repriced`)
    assert.equal(describeFlow(approveRepriced).label, 'Waiting for Ethereum…')
    const sendAfter = walk(
      [start(direction), ev('SEND_PROMPT'), ev('SEND_SENT', { hash: H3 })],
      flowReducer(approveRepriced, EVENTS.APPROVE_MINED),
    )
    assert.equal(
      describeFlow(sendAfter).status,
      'Migration sent. Waiting for Ethereum.',
      `${direction}: an approve reprice is not a send reprice`,
    )
    const sendRepriced = flowReducer(sendAfter, EVENTS.SEND_REPLACED)
    assert.equal(describeFlow(sendRepriced).status, sped, `${direction} send repriced`)
    // ...and the mined sentence comes from the event, not the input.
    const mined = flowReducer(
      sendRepriced,
      ev('SEND_MINED', { hash: H4, to: ACCOUNT, amount: AMOUNT, blockNumber: 1n }),
    )
    assert.equal(describeFlow(mined).status, (direction === 'forward' ? forward : reverse).mined[2])
  }
})

// --- 11. ABI completeness ----------------------------------------------------

test('the migrator ABI parses, carries every error the contract can raise, and the reads the checks need', () => {
  // Pure, offline: a signature with a typo throws here rather than in a browser.
  const abi = parseAbi([...MIGRATOR_ABI_SIGNATURES])
  const names = (type) => abi.filter((item) => item.type === type).map((item) => item.name)
  const find = (type, name) => abi.find((item) => item.type === type && item.name === name)

  assert.deepStrictEqual(names('error'), [
    'ZeroAddress',
    'TokensMustDiffer',
    'DecimalMismatch',
    'SwapsPaused',
    'InsufficientInventory',
    'InsufficientEscrowBalance',
    'SettlementMismatch',
    'InvalidLiquidityPosition',
    'InvalidTickSpacing',
    'InvalidInitialPrice',
    'UnknownUnlockOperation',
    'TransferFromFailed',
    'Reentrancy',
    'Unauthorized',
    'NotPoolManager',
  ])
  assert.deepStrictEqual(names('function'), [
    'migrate',
    'unmigrate',
    'paused',
    'inventoryB',
    'escrowedA',
    'tokenA',
    'tokenB',
    'owner',
    'poolManager',
  ])
  assert.deepStrictEqual(names('event'), [
    'Migrated',
    'Unmigrated',
    'PauseChanged',
    'InventoryFunded',
    'InventoryWithdrawn',
  ])

  // migrate/unmigrate take (amount, to): §8 asserts request.args[1] === account.
  for (const fn of ['migrate', 'unmigrate']) {
    assert.deepStrictEqual(
      find('function', fn).inputs.map((i) => [i.name, i.type]),
      [
        ['amount', 'uint256'],
        ['to', 'address'],
      ],
      fn,
    )
    assert.equal(find('function', fn).stateMutability, 'nonpayable', fn)
  }
  // The views the checks and the caps strip read.
  for (const [fn, out] of [
    ['paused', 'bool'],
    ['inventoryB', 'uint256'],
    ['escrowedA', 'uint256'],
    ['tokenA', 'address'],
    ['tokenB', 'address'],
    ['owner', 'address'],
    ['poolManager', 'address'],
  ]) {
    assert.equal(find('function', fn).stateMutability, 'view', fn)
    assert.deepStrictEqual(
      find('function', fn).outputs.map((o) => o.type),
      [out],
      fn,
    )
  }
  // The two events the page reads to confirm a migration carry `to` and `amount`.
  for (const eventName of ['Migrated', 'Unmigrated']) {
    assert.deepStrictEqual(
      find('event', eventName).inputs.map((i) => [i.name, i.type, i.indexed === true]),
      [
        ['sender', 'address', true],
        ['to', 'address', true],
        ['amount', 'uint256', false],
      ],
      eventName,
    )
  }
  // The two-argument errors expose (available, required), which describeRevert prints in that order.
  for (const err of ['InsufficientInventory', 'InsufficientEscrowBalance']) {
    assert.deepStrictEqual(
      find('error', err).inputs.map((i) => [i.name, i.type]),
      [
        ['available', 'uint256'],
        ['required', 'uint256'],
      ],
      err,
    )
  }
  assert.ok(Object.isFrozen(MIGRATOR_ABI_SIGNATURES))
  assert.equal(
    new Set(MIGRATOR_ABI_SIGNATURES).size,
    MIGRATOR_ABI_SIGNATURES.length,
    'no duplicate signatures',
  )
})

test('the ERC-20 and BIC ABIs: the calls the page makes, the OpenZeppelin ERC-6093 errors, and treasury on BIC only', () => {
  const erc20 = parseAbi([...ERC20_ABI_SIGNATURES])
  const bic = parseAbi([...BIC_ABI_SIGNATURES])
  const names = (abi, type) => abi.filter((item) => item.type === type).map((item) => item.name)

  assert.deepStrictEqual(names(erc20, 'function'), [
    'approve',
    'allowance',
    'balanceOf',
    'decimals',
    'symbol',
    'name',
    'totalSupply',
  ])
  // BIC is OpenZeppelin ERC20 v5, so its custom errors are the ERC-6093 set.
  assert.deepStrictEqual(names(erc20, 'error'), [
    'ERC20InsufficientAllowance',
    'ERC20InsufficientBalance',
    'ERC20InvalidApprover',
    'ERC20InvalidReceiver',
    'ERC20InvalidSender',
    'ERC20InvalidSpender',
  ])
  const approve = erc20.find((item) => item.type === 'function' && item.name === 'approve')
  assert.deepStrictEqual(
    approve.inputs.map((i) => [i.name, i.type]),
    [
      ['spender', 'address'],
      ['amount', 'uint256'],
    ],
  )
  assert.equal(approve.stateMutability, 'nonpayable')

  assert.deepStrictEqual(names(bic, 'function'), [...names(erc20, 'function'), 'treasury'])
  assert.deepStrictEqual(names(bic, 'error'), names(erc20, 'error'))
  assert.deepStrictEqual(
    [...BIC_ABI_SIGNATURES],
    [...ERC20_ABI_SIGNATURES, 'function treasury() view returns (address)'],
  )
  assert.ok(
    !ERC20_ABI_SIGNATURES.some((s) => s.includes('treasury')),
    'NFD has no treasury; the plain ERC-20 ABI must not claim one',
  )
  assert.ok(Object.isFrozen(ERC20_ABI_SIGNATURES))
  assert.ok(Object.isFrozen(BIC_ABI_SIGNATURES))
})

test('every revert describeRevert has words for is decodable from one of the ABIs', () => {
  const declared = new Set(
    [...MIGRATOR_ABI_SIGNATURES, ...ERC20_ABI_SIGNATURES]
      .filter((s) => s.startsWith('error '))
      .map((s) => s.slice('error '.length, s.indexOf('('))),
  )
  for (const name of [
    'SwapsPaused',
    'InsufficientInventory',
    'InsufficientEscrowBalance',
    'ZeroAddress',
    'TransferFromFailed',
    'SettlementMismatch',
    'ERC20InsufficientAllowance',
    'ERC20InsufficientBalance',
  ]) {
    assert.ok(declared.has(name), `${name} must be in an ABI or its copy can never be reached`)
    assert.notEqual(
      describeRevert(name, [1n, 2n], 'forward'),
      `The contract refused: ${name}. Nothing moved.`,
      `${name} has its own copy`,
    )
  }
})

// --- 12. constants -----------------------------------------------------------

test('the constants are the RUNBOOK §0 values, verbatim, and never come from the environment', () => {
  assert.equal(NFD_ADDRESS, '0xDFDb7f72c1F195C5951a234e8DB9806EB0635346')
  assert.equal(COMMUNITY_MULTISIG, '0x8569FCa4fb54CE58228992CDA60bc920A574cf39')
  assert.equal(POOL_MANAGER, '0x000000000004444c5dc75cB358380D2e3dE08A90')
  for (const address of [NFD_ADDRESS, COMMUNITY_MULTISIG, POOL_MANAGER])
    assert.ok(isAddressShaped(address), address)
  assert.equal(
    new Set([NFD_ADDRESS, COMMUNITY_MULTISIG, POOL_MANAGER].map((a) => a.toLowerCase())).size,
    3,
    'three different contracts',
  )

  assert.equal(MAINNET_CHAIN_ID, 1)
  assert.equal(DECIMALS, 18)
  assert.equal(ZERO, 0n)
  assert.equal(ONE_TOKEN, 10n ** 18n)
  assert.equal(BIC_TOTAL_SUPPLY, 100_000_000_000n * 10n ** 18n)
  assert.equal(formatAmountGrouped(BIC_TOTAL_SUPPLY), '100,000,000,000')
  assert.equal(NFD_SYMBOL, 'NFD')
  assert.equal(BIC_SYMBOL, 'BIC')
  assert.equal(NFD_ASSET_SLUG, 'feisty-doge-nft')
  assert.equal(SESSION_KEY, 'bic:migrate:wallet')

  assert.equal(POLL_MS, 12_000)
  assert.equal(STALE_MS, 90_000)
  assert.equal(PENDING_RELEASE_MS, 600_000)
  assert.ok(POLL_MS < STALE_MS, 'a read cannot go stale between two polls')
  assert.ok(STALE_MS < PENDING_RELEASE_MS, 'a stall is longer than a stale read')

  assert.equal(CONTRACTS_REPO_URL, 'https://github.com/BICDAO/NFD-BIC-Migration')
  assert.equal(typeof CONTRACTS_REPO_PUBLIC, 'boolean')
  assert.equal(DEVAMP_URL, 'https://devamp.it')
  assert.equal(NFD_REVIEW_URL, `${DEVAMP_URL}/token/feisty-doge`)
  assert.ok(AUDIT_URL === null || /^https:\/\//.test(AUDIT_URL), 'the audit link is null or https')
})

test('PUBLIC_RPCS are https, unique, and exclude the two that failed the CORS preflight', () => {
  assert.ok(Array.isArray(PUBLIC_RPCS) && PUBLIC_RPCS.length >= 2, 'at least one fallback')
  for (const url of PUBLIC_RPCS) {
    assert.equal(new URL(url).protocol, 'https:', url)
    assert.equal(url, url.trim(), url)
  }
  assert.equal(new Set(PUBLIC_RPCS).size, PUBLIC_RPCS.length, 'no duplicates')
  assert.equal(
    new Set(PUBLIC_RPCS.map((u) => new URL(u).host)).size,
    PUBLIC_RPCS.length,
    'one entry per host',
  )
  for (const excluded of ['llamarpc', 'merkle.io']) {
    assert.ok(
      !PUBLIC_RPCS.some((u) => u.includes(excluded)),
      `${excluded} answered the preflight badly on 2026-09-04`,
    )
  }
})

test('the production pin is both set or both null, and readConfig follows it', () => {
  const pinned = KNOWN_HOOK !== null || KNOWN_BIC !== null
  const production = readConfig({
    hook: HOOK,
    bic: BIC,
    vercelEnv: 'production',
    knownHook: KNOWN_HOOK,
    knownBic: KNOWN_BIC,
  })
  if (pinned) {
    assert.ok(isAddressShaped(KNOWN_HOOK), 'KNOWN_HOOK must be an address once set')
    assert.ok(isAddressShaped(KNOWN_BIC), 'KNOWN_BIC must be an address once set')
    assert.ok(!sameAddress(KNOWN_HOOK, KNOWN_BIC))
    assert.ok(!sameAddress(KNOWN_BIC, NFD_ADDRESS))
    assert.ok(!sameAddress(KNOWN_HOOK, NFD_ADDRESS))
    assert.deepStrictEqual(production, {
      state: 'configured',
      hook: KNOWN_HOOK,
      bic: KNOWN_BIC,
      source: 'pinned',
    })
  } else {
    assert.equal(KNOWN_HOOK, null)
    assert.equal(KNOWN_BIC, null)
    assert.deepStrictEqual(
      production,
      { state: 'unconfigured', reason: 'production-unpinned' },
      'a valid env pair does not make production live',
    )
  }
})

// --- 13. .d.ts parity --------------------------------------------------------

/**
 * src/lib/migration.d.ts is hand-written and TypeScript will not say when it
 * drifts from the runtime module. Read as text on purpose, like the chain-alias
 * parity test in the DeVamp suite this came from: importing it would need a loader, and the
 * point is only to compare two lists.
 */
// Resolved from the project root: vitest's jsdom environment does not give
// this module a file: URL, so `new URL(..., import.meta.url)` cannot be used.
const dts = readFileSync(resolve(process.cwd(), 'src/lib/migration.d.ts'), 'utf8')

test('src/lib/migration.d.ts declares exactly the names src/lib/migration.mjs exports', () => {
  const declared = [...dts.matchAll(/^export (?:const|function) (\w+)/gm)].map((m) => m[1])
  const runtime = Object.keys(migration)
  assert.ok(declared.length > 40, 'parsed suspiciously few declarations from the .d.ts')
  assert.equal(new Set(declared).size, declared.length, 'a name is declared twice in the .d.ts')
  assert.deepStrictEqual(
    runtime.filter((name) => !declared.includes(name)),
    [],
    'exported by src/lib/migration.mjs but not declared in src/lib/migration.d.ts',
  )
  assert.deepStrictEqual(
    declared.filter((name) => !runtime.includes(name)),
    [],
    'declared in src/lib/migration.d.ts but not exported by src/lib/migration.mjs',
  )
  assert.deepStrictEqual([...declared].sort(), [...runtime].sort())
  // Every declared function is a function and every declared const is not.
  for (const m of dts.matchAll(/^export (const|function) (\w+)/gm)) {
    const [, kind, name] = m
    assert.equal(
      typeof migration[name] === 'function',
      kind === 'function',
      `${name} is declared as a ${kind}`,
    )
  }
})

test('the ABI tuples in src/lib/migration.d.ts equal the runtime arrays, element for element', () => {
  const blocks = [
    ...dts.matchAll(/^export const (\w+_ABI_SIGNATURES): readonly \[([\s\S]*?)^\];?$/gm),
  ]
  assert.deepStrictEqual(
    blocks.map((m) => m[1]),
    ['MIGRATOR_ABI_SIGNATURES', 'ERC20_ABI_SIGNATURES', 'BIC_ABI_SIGNATURES'],
    'could not find the three tuple declarations in src/lib/migration.d.ts',
  )
  for (const [, name, body] of blocks) {
    const declared = [...body.matchAll(/'([^']*)'/g)].map((m) => m[1])
    assert.ok(declared.length > 0, `${name} tuple is empty in the .d.ts`)
    assert.deepStrictEqual(
      declared,
      [...migration[name]],
      `${name}: src/lib/migration.d.ts and src/lib/migration.mjs disagree`,
    )
  }
  // Every runtime signature array has a tuple, so a fourth ABI cannot be added untyped.
  const runtimeAbis = Object.keys(migration).filter((name) => name.endsWith('_ABI_SIGNATURES'))
  assert.deepStrictEqual([...runtimeAbis].sort(), blocks.map((m) => m[1]).sort())
  // And the literal constants the .d.ts pins as string literal types are those values.
  const literals = [...dts.matchAll(/^export const (\w+): '([^']*)';?$/gm)]
  // The `;?` above tolerates this repo's semicolon-free prettier style; without
  // this guard a formatting change could make the loop below match nothing and
  // the test would pass by doing nothing.
  assert.ok(
    literals.length > 0,
    'parsed no string literal types from the .d.ts — has its formatting changed?',
  )
  for (const [, name, literal] of literals) {
    assert.equal(migration[name], literal, `${name} literal type in the .d.ts`)
  }
  for (const [, name, literal] of dts.matchAll(/^export const (\w+): (\d+);?$/gm)) {
    assert.equal(migration[name], Number(literal), `${name} numeric literal type in the .d.ts`)
  }
})

// --- 14. review fixes, 2026-09-04 ----------------------------------------------

test('parseAmount refuses an integer beyond uint256', () => {
  const max = (2n ** 256n - 1n).toString()
  assert.deepStrictEqual(
    parseAmount('115792089237316195423570985008687907853269984665640564039457'),
    { ok: true, value: 115792089237316195423570985008687907853269984665640564039457n * 10n ** 18n },
  )
  assert.deepStrictEqual(parseAmount(`${max}0`), { ok: false, reason: 'too-large' })
})

test('readConfig: a production build off Vercel is production too, and a bad pin is invalid', () => {
  const hook = '0x1111111111111111111111111111111111111111'
  const bic = '0x2222222222222222222222222222222222222222'
  assert.deepStrictEqual(readConfig({ hook, bic, nodeEnv: 'production' }), {
    state: 'unconfigured',
    reason: 'production-unpinned',
  })
  assert.equal(
    readConfig({ hook, bic, nodeEnv: 'production', vercelEnv: 'preview' }).state,
    'configured',
    'a Vercel preview keeps the env path',
  )
  assert.equal(readConfig({ hook, bic, nodeEnv: 'production', vercelEnv: 'preview' }).source, 'env')
  const pinned = readConfig({ nodeEnv: 'production', knownHook: hook, knownBic: bic })
  assert.deepStrictEqual(pinned, { state: 'configured', hook, bic, source: 'pinned' })
  const badPin = readConfig({ vercelEnv: 'production', knownHook: hook, knownBic: hook })
  assert.equal(badPin.state, 'invalid')
  assert.ok(badPin.problems[0].includes('KNOWN_HOOK'))
})

test('capAdvice and describeRevert with an empty capacity do not say "migrate 0"', () => {
  for (const direction of ['forward', 'reverse']) {
    const advice = capAdvice({ direction, amount: ONE_TOKEN, cap: 0n })
    assert.ok(advice && !advice.includes(' 0 ') && !advice.includes('split'), advice)
  }
  assert.ok(!describeRevert('InsufficientInventory', [0n, ONE_TOKEN], 'forward').includes(' 0 '))
  assert.ok(
    !describeRevert('InsufficientEscrowBalance', [0n, ONE_TOKEN], 'reverse').includes(' 0 '),
  )
})

test('a stalled flow ignores a timeout FAIL, records the approval block, and logs a late hash after an abort', () => {
  const stalled = walk([
    start(),
    ev('APPROVE_PROMPT'),
    ev('APPROVE_SENT', { hash: H1 }),
    ev('RELEASE'),
  ])
  assert.equal(stalled.step, 'stalled')
  same(flowReducer(stalled, ev('FAIL', { kind: 'timeout', message: 'Still pending.' })), stalled)
  const approved = flowReducer(
    stalled,
    ev('APPROVE_MINED', { hash: H1, allowance: AMOUNT, blockNumber: 42n }),
  )
  assert.equal(approved.step, 'approved')
  assert.equal(approved.approveMined, true)
  assert.equal(approved.approvedAtBlock, 42n)
  const aborted = flowReducer(walk([start(), ev('SEND_PROMPT')]), { type: 'ABORT' })
  const late = flowReducer(aborted, ev('LATE_HASH', { which: 'send', hash: H3 }))
  assert.equal(late.step, 'aborted')
  assert.equal(late.sendHash, H3)
  same(flowReducer(late, ev('LATE_HASH', { which: 'send', hash: H4, id: 'someone-else' })), late)
  same(
    flowReducer(approved, ev('LATE_HASH', { which: 'approve', hash: H2 })),
    approved,
    'only an aborted flow takes a late hash',
  )
})
