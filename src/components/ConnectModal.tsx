'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { renderSVG } from 'uqr'
import { createSiweMessage } from 'viem/siwe'
import { type Connector, useConnect, useConnectors, useSignMessage, WagmiProvider } from 'wagmi'

import { wagmiConfig } from '@/lib/wagmi'

import type { SessionUser } from './ConnectButton'

type Props = { onClose: () => void; onSignedIn: (user: SessionUser) => void }

const queryClient = new QueryClient()

export default function ConnectModal(props: Props) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <Modal {...props} />
      </QueryClientProvider>
    </WagmiProvider>
  )
}

function Modal({ onClose, onSignedIn }: Props) {
  const all = useConnectors()
  const connect = useConnect()
  const sign = useSignMessage()
  const [uri, setUri] = useState<string>()
  const [status, setStatus] = useState<string>()

  // Generic "Injected" only when no EIP-6963 wallet announced itself but window.ethereum exists.
  const discovered = all.filter((c) => c.type === 'injected' && c.id !== 'injected')
  const connectors = all.filter(
    (c) => c.id !== 'injected' || (!discovered.length && typeof window !== 'undefined' && 'ethereum' in window),
  )

  // WalletConnect pairing URI → our own QR (no vendor modal).
  useEffect(() => {
    const wc = all.find((c) => c.type === 'walletConnect')
    if (!wc) return
    const onMessage = ({ type, data }: { type: string; data?: unknown }) => type === 'display_uri' && setUri(String(data))
    wc.emitter.on('message', onMessage)
    return () => wc.emitter.off('message', onMessage)
  }, [all])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const signIn = async (connector: Connector) => {
    try {
      setStatus('Connecting…')
      const { accounts, chainId } = await connect.mutateAsync({ connector })
      const address = accounts[0]
      setUri(undefined)
      setStatus('Sign the message in your wallet…')
      const { nonce } = await (await fetch('/api/users/siwe/nonce', { credentials: 'include' })).json()
      const message = createSiweMessage({
        address,
        chainId,
        domain: window.location.host,
        nonce,
        uri: window.location.origin,
        version: '1',
        statement: 'Sign in to the Bureau of Internet Culture.',
      })
      const signature = await sign.mutateAsync({ message, account: address, connector })
      const res = await fetch('/api/users/siwe/verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, signature }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.errors?.[0]?.message ?? 'Sign-in failed')
      onSignedIn(data.user)
      onClose()
    } catch (e) {
      setUri(undefined)
      setStatus(e instanceof Error ? (e.message.split('\n')[0] ?? 'Failed') : 'Failed')
    }
  }

  return (
    <div className="connect-overlay" onClick={onClose}>
      <div className="connect-modal" role="dialog" aria-modal="true" aria-label="Connect wallet" onClick={(e) => e.stopPropagation()}>
        <div className="connect-head">
          <div className="section-sub-title">CONNECT WALLET</div>
          <button type="button" className="connect-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        {uri ? (
          <div className="connect-qr">
            <div dangerouslySetInnerHTML={{ __html: renderSVG(uri, { blackColor: '#000', whiteColor: '#fff' }) }} />
            <a href={uri} className="footer-menu-link">
              OPEN IN WALLET →
            </a>
          </div>
        ) : (
          <div className="connect-list">
            {connectors.map((c) => (
              <button key={c.uid} type="button" className="connect-option" onClick={() => signIn(c)}>
                {c.icon && <img src={c.icon} alt="" />}
                {c.name}
              </button>
            ))}
            {!connectors.length && <div className="footer-menu-link">No wallet found. Install a browser wallet.</div>}
          </div>
        )}
        {status && <div className="connect-status">{status}</div>}
      </div>
    </div>
  )
}
