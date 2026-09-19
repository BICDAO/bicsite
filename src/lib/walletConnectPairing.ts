import type { EIP1193Provider } from 'viem'

import { WALLETCONNECT_RDNS, registerProvider } from './eip6963'

/**
 * WalletConnect for the migration page.
 *
 * EIP-6963 only sees extensions installed in *this* browser, so on a phone the
 * picker is usually empty and on a desktop it lists whatever happens to be
 * installed. WalletConnect is how every other wallet — mobile, hardware behind
 * a mobile app, a wallet on another machine — reaches this page at all.
 *
 * Three deliberate choices:
 *
 *  - **`UniversalProvider` directly, not wagmi.** The nav's CONNECT button uses
 *    a wagmi connector for signing in to the CMS. This page signs transactions
 *    that move tokens, and BICDAO/bicsite#26 is the standing decision to keep
 *    those two paths sharing no code. `UniversalProvider` is an EIP-1193
 *    provider, which is all `useWallet` has ever wanted, so nothing about the
 *    signing path changes.
 *  - **Loaded on demand.** The import is large and initialising it opens a
 *    relay socket. Nothing happens until someone picks WalletConnect, so a
 *    visitor who never connects pays nothing and opens no session.
 *  - **No vendor modal.** The pairing URI is handed back and this page draws
 *    its own QR, the same as the nav modal does.
 */

type Listener = (uri: string | null) => void

let provider: EIP1193Provider | null = null
let pending: Promise<EIP1193Provider | null> | null = null
const listeners = new Set<Listener>()
let currentUri: string | null = null

function emit(uri: string | null) {
  currentUri = uri
  for (const l of listeners) l(uri)
}

/** Subscribe to the pairing URI. Null means "nothing to show". */
export function onPairingUri(listener: Listener): () => void {
  listeners.add(listener)
  listener(currentUri)
  return () => {
    listeners.delete(listener)
  }
}

export function projectId(): string | null {
  const id = process.env.NEXT_PUBLIC_WC_PROJECT_ID
  return typeof id === 'string' && id.trim() !== '' ? id.trim() : null
}

/** True when WalletConnect can be offered at all. */
export function isAvailable(): boolean {
  return projectId() !== null
}

/**
 * Initialise WalletConnect and register it as a pickable provider.
 *
 * Returns the provider, or null when there is no project id configured — in
 * which case the option is not offered and the picker says so, rather than
 * showing a button that cannot work.
 */
export async function ensureWalletConnect(): Promise<EIP1193Provider | null> {
  if (provider) return provider
  if (pending) return pending
  const id = projectId()
  if (!id) return null

  pending = (async () => {
    const { UniversalProvider } = await import('@walletconnect/universal-provider')
    const origin = window.location.origin
    const p = await UniversalProvider.init({
      projectId: id,
      metadata: {
        name: 'Bureau of Internet Culture',
        description: 'Migrate NFD to BIC',
        url: origin,
        icons: [`${origin}/brand/bic-logo.svg`],
      },
    })
    // The pairing URI arrives once per connection attempt and is dead as soon
    // as the session is established or abandoned.
    p.on('display_uri', (uri: string) => emit(uri))
    p.on('connect', () => emit(null))
    p.on('session_delete', () => emit(null))
    const eip1193 = p as unknown as EIP1193Provider
    provider = eip1193
    registerProvider(
      { rdns: WALLETCONNECT_RDNS, name: 'WalletConnect', icon: null },
      eip1193,
    )
    return eip1193
  })()

  try {
    return await pending
  } finally {
    pending = null
  }
}

/**
 * Establish the session, which is what produces the QR.
 *
 * `UniversalProvider.request()` throws without one, so this has to happen
 * before `useWallet` asks for accounts. Mainnet only: the migration exists on
 * chain 1 and nowhere else, so there is nothing to gain from asking a wallet
 * for permissions it will never be used for.
 */
export async function pair(): Promise<boolean> {
  const p = await ensureWalletConnect()
  if (!p) return false
  const wc = p as unknown as {
    session?: unknown
    connect: (opts: unknown) => Promise<unknown>
  }
  if (wc.session) return true
  await wc.connect({
    optionalNamespaces: {
      eip155: {
        chains: ['eip155:1'],
        methods: [
          'eth_sendTransaction',
          'eth_signTypedData_v4',
          'personal_sign',
          'wallet_switchEthereumChain',
        ],
        events: ['accountsChanged', 'chainChanged'],
      },
    },
  })
  emit(null)
  return true
}

/** Drop any pairing QR still on screen. */
export function clearPairingUri(): void {
  emit(null)
}
