import { base, mainnet } from 'viem/chains'

/** Chains accepted for wallet connect + sign-in (shared by client config and server verification). */
export const chains = [mainnet, base] as const
