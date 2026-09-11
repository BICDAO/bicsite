import { createConfig, http, injected } from 'wagmi'

import { chains } from './chains'
import { walletConnect } from './walletConnect'

const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID

/** Browser wallets via EIP-6963 discovery; WalletConnect only when a project id is configured. */
export const wagmiConfig = createConfig({
  chains,
  connectors: [injected(), ...(projectId ? [walletConnect({ projectId })] : [])],
  transports: { [chains[0].id]: http(), [chains[1].id]: http() },
})
