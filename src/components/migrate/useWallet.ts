'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  BaseError,
  createWalletClient,
  custom,
  getAddress,
  type Address,
  type EIP1193Provider,
  type WalletClient,
} from 'viem'
import { mainnet } from 'viem/chains'
import {
  LEGACY_RDNS,
  getServerSnapshot,
  getSnapshot,
  providerFor,
  subscribe,
  type WalletInfo,
} from '@/lib/eip6963'
import { MAINNET_CHAIN_ID, SESSION_KEY, describeWalletError } from '@/lib/migration'

/**
 * One wallet, chosen by the user, for the migration page.
 *
 * What it does: lists the wallets the browser announces (lib/eip6963.ts),
 * connects to the one the user clicks, remembers that choice for the tab, and
 * follows the wallet's own account and network changes. What it never does:
 * connect from an effect (a prompt that opens on page load is what phishing
 * pages do), read balances (the page reads those through public nodes), or
 * add a network to the wallet (`wallet_addEthereumChain` is how a bad page
 * points a wallet at a bad node; this one only ever asks to SWITCH to
 * mainnet, which the wallet already knows).
 *
 * The provider objects stay inside lib/eip6963.ts. This hook holds a viem
 * wallet client in a ref for the duration of a connection and hands it out
 * through `getWalletClient()` at the moment a signature is needed.
 */

export type WalletStatus = 'none' | 'connecting' | 'connected'

export type WalletState = {
  status: WalletStatus
  rdns: string | null
  account: Address | null
  chainId: number | null
  error: string | null
}

const NONE: WalletState = { status: 'none', rdns: null, account: null, chainId: null, error: null }

type Listener<T> = (payload: T) => void

function readSession(): string | null {
  try {
    return window.sessionStorage.getItem(SESSION_KEY)
  } catch {
    return null
  }
}

function writeSession(rdns: string | null) {
  try {
    if (rdns) window.sessionStorage.setItem(SESSION_KEY, rdns)
    else window.sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // Private mode or storage disabled: the choice simply is not remembered.
  }
}

function errorCode(err: unknown): number | null {
  if (err instanceof BaseError) {
    const withCode = err.walk((e) => typeof (e as { code?: unknown }).code === 'number') as {
      code: number
    } | null
    if (withCode) return withCode.code
  }
  const code = (err as { code?: unknown })?.code
  return typeof code === 'number' ? code : null
}

function shortMessage(err: unknown): string | undefined {
  if (err instanceof BaseError) return err.shortMessage
  if (err instanceof Error) return err.message
  return undefined
}

function parseChainId(value: unknown): number | null {
  if (typeof value === 'string') {
    const n = value.startsWith('0x') ? parseInt(value, 16) : Number(value)
    return Number.isFinite(n) ? n : null
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return null
}

function firstAddress(accounts: unknown): Address | null {
  if (!Array.isArray(accounts) || typeof accounts[0] !== 'string') return null
  try {
    return getAddress(accounts[0])
  } catch {
    return null
  }
}

export function useWallet({
  onAccountChanged,
  onChainChanged,
}: {
  /** The account changed or went away. Receives the new account, or null. */
  onAccountChanged?: (account: Address | null) => void
  onChainChanged?: (chainId: number | null) => void
} = {}) {
  const wallets: readonly WalletInfo[] = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  )
  const [state, setState] = useState<WalletState>(NONE)
  const clientRef = useRef<WalletClient | null>(null)
  const restoredRef = useRef(false)
  // The restore below re-runs whenever the wallet list changes, which is
  // every announcement; its in-flight request must survive those re-runs and
  // be dropped only when the component is really gone.
  const unmountedRef = useRef(false)
  useEffect(() => {
    unmountedRef.current = false
    return () => {
      unmountedRef.current = true
    }
  }, [])

  // The latest callbacks, read only from listeners and handlers — never in
  // render — so the effects below do not have to re-subscribe when a parent
  // re-renders with a new closure.
  const callbacks = useRef({ onAccountChanged, onChainChanged })
  useEffect(() => {
    callbacks.current = { onAccountChanged, onChainChanged }
  }, [onAccountChanged, onChainChanged])
  const accountChanged = useCallback(
    (account: Address | null) => callbacks.current.onAccountChanged?.(account),
    [],
  )
  const chainChanged = useCallback(
    (chainId: number | null) => callbacks.current.onChainChanged?.(chainId),
    [],
  )

  const makeClient = useCallback((provider: EIP1193Provider, account: Address) => {
    clientRef.current = createWalletClient({ chain: mainnet, transport: custom(provider), account })
  }, [])

  /** Silent restore of the tab's last wallet; never prompts. */
  useEffect(() => {
    if (restoredRef.current) return
    const remembered = readSession()
    if (!remembered) {
      restoredRef.current = true
      return
    }
    const provider = providerFor(remembered)
    if (!provider) return // not announced yet; try again when the list changes
    restoredRef.current = true
    ;(async () => {
      try {
        const accounts = await provider.request({ method: 'eth_accounts' })
        const account = firstAddress(accounts)
        if (unmountedRef.current) return
        if (!account) {
          writeSession(null)
          return
        }
        const chainId = parseChainId(await provider.request({ method: 'eth_chainId' }))
        if (unmountedRef.current) return
        makeClient(provider, account)
        setState({ status: 'connected', rdns: remembered, account, chainId, error: null })
      } catch {
        if (!unmountedRef.current) writeSession(null)
      }
    })()
  }, [wallets, makeClient])

  /** Follow the chosen provider's own events for as long as it is chosen. */
  useEffect(() => {
    const rdns = state.rdns
    if (!rdns || state.status !== 'connected') return
    const provider = providerFor(rdns)
    if (!provider || typeof provider.on !== 'function') return

    const onAccounts: Listener<readonly string[]> = (accounts) => {
      const account = firstAddress(accounts)
      if (account) {
        makeClient(provider, account)
        setState((s) => ({ ...s, status: 'connected', account, error: null }))
      } else {
        clientRef.current = null
        writeSession(null)
        setState(NONE)
      }
      accountChanged(account)
    }
    const onChain: Listener<string> = (hex) => {
      const chainId = parseChainId(hex)
      // A network change resolves whatever a declined switch was complaining about.
      setState((s) => ({ ...s, chainId, error: null }))
      chainChanged(chainId)
    }
    const onDisconnect = () => {
      clientRef.current = null
      writeSession(null)
      setState(NONE)
      accountChanged(null)
    }

    provider.on('accountsChanged', onAccounts)
    provider.on('chainChanged', onChain)
    provider.on('disconnect', onDisconnect)
    return () => {
      provider.removeListener('accountsChanged', onAccounts)
      provider.removeListener('chainChanged', onChain)
      provider.removeListener('disconnect', onDisconnect)
    }
  }, [state.rdns, state.status, makeClient, accountChanged, chainChanged])

  /** From a click handler only. */
  const connect = useCallback(
    async (rdns: string) => {
      const provider = providerFor(rdns)
      if (!provider) {
        setState({ ...NONE, error: 'That wallet is no longer available in this browser.' })
        return
      }
      setState({ status: 'connecting', rdns, account: null, chainId: null, error: null })
      try {
        const accounts = await provider.request({ method: 'eth_requestAccounts' })
        const account = firstAddress(accounts)
        if (!account) throw new Error('The wallet returned no account.')
        const chainId = parseChainId(await provider.request({ method: 'eth_chainId' }))
        makeClient(provider, account)
        // The window.ethereum guess is not remembered: next time it could be
        // a different extension, and a silent restore must not pick one.
        writeSession(rdns === LEGACY_RDNS ? null : rdns)
        setState({ status: 'connected', rdns, account, chainId, error: null })
      } catch (err) {
        clientRef.current = null
        const code = errorCode(err)
        setState({
          ...NONE,
          error:
            code === 4001
              ? 'You cancelled in your wallet. Nothing was connected.'
              : describeWalletError(code, shortMessage(err)),
        })
      }
    },
    [makeClient],
  )

  /** Only ever a switch; never an add. */
  const switchToMainnet = useCallback(async () => {
    const client = clientRef.current
    const provider = state.rdns ? providerFor(state.rdns) : null
    if (!client || !provider) return
    try {
      await client.switchChain({ id: MAINNET_CHAIN_ID })
    } catch (err) {
      const code = errorCode(err)
      setState((s) => ({
        ...s,
        error:
          code === 4001
            ? 'You declined the network switch in your wallet.'
            : describeWalletError(code, shortMessage(err)),
      }))
      return
    }
    // MetaMask can fire chainChanged before the promise resolves; re-read.
    try {
      const chainId = parseChainId(await provider.request({ method: 'eth_chainId' }))
      setState((s) => ({ ...s, chainId, error: null }))
    } catch {
      // The event listener will catch up.
    }
  }, [state.rdns])

  /** Forgets the page's choice. The wallet's own site permission is its own. */
  const forget = useCallback(() => {
    clientRef.current = null
    writeSession(null)
    setState(NONE)
    accountChanged(null)
  }, [accountChanged])

  const clearError = useCallback(() => setState((s) => (s.error ? { ...s, error: null } : s)), [])

  /** For the write flow, at the moment it needs to sign. */
  const getWalletClient = useCallback(() => clientRef.current, [])

  const onMainnet = state.status === 'connected' && state.chainId === MAINNET_CHAIN_ID

  return {
    wallets,
    ...state,
    onMainnet,
    connect,
    switchToMainnet,
    forget,
    clearError,
    getWalletClient,
  }
}

export type Wallet = ReturnType<typeof useWallet>
