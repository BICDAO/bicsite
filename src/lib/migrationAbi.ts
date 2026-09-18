import { parseAbi } from 'viem'

import { BIC_ABI_SIGNATURES, ERC20_ABI_SIGNATURES, MIGRATOR_ABI_SIGNATURES } from './migration'

/**
 * The ABIs, typed.
 *
 * The signature strings live in lib/migration.mjs so the test suite can assert
 * their completeness; this file only turns them into what viem wants. Because
 * the .d.ts declares each array as a literal tuple, `parseAbi` infers every
 * function's name, arguments and return type, and a decoded revert carries
 * its error name — which is the whole reason the errors are in there.
 */
export const MIGRATOR_ABI = parseAbi(MIGRATOR_ABI_SIGNATURES)
export const ERC20_ABI = parseAbi(ERC20_ABI_SIGNATURES)
export const BIC_ABI = parseAbi(BIC_ABI_SIGNATURES)
