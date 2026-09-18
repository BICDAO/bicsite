/**
 * Etherscan links for Ethereum mainnet.
 *
 * The migration page is mainnet-only by design — the contract knows one NFD,
 * at one address, on one chain — so this is a flat set of URL builders rather
 * than a chain registry. `lib/chains.ts` is the wallet-connect chain list and
 * is not the same question.
 */
export const EXPLORER_NAME = 'Etherscan'

export const explorer = {
  name: EXPLORER_NAME,
  token: (address: string) => `https://etherscan.io/token/${address}`,
  address: (address: string) => `https://etherscan.io/address/${address}`,
  tx: (hash: string) => `https://etherscan.io/tx/${hash}`,
}
