'use client'

import { renderSVG } from 'uqr'

import type { WalletInfo } from '@/lib/eip6963'

/**
 * The list of wallets the browser announced, as plain buttons.
 *
 * Names and rdns render as text nodes, icons only when they are data: URIs,
 * and nothing here imitates a wallet's own window — the whole point of
 * EIP-6963 is that the page never has to guess which extension answers.
 */
export function WalletPicker({
  wallets,
  connecting,
  error,
  onPick,
  walletConnect,
}: {
  wallets: readonly WalletInfo[]
  connecting: string | null
  error: string | null
  onPick: (rdns: string) => void
  /** WalletConnect, when a project id is configured. EIP-6963 can only see
   *  extensions in this browser, so without this a phone sees an empty list. */
  walletConnect?: { available: boolean; pairing: boolean; uri: string | null; onPick: () => void }
}) {
  return (
    <div className="mig-wallets" aria-busy={connecting !== null}>
      <p className="mig-label">Choose a wallet</p>
      {walletConnect?.uri && (
        <div className="mig-wc-qr">
          <p className="mig-label">Scan with your wallet</p>
          <div
            aria-label="WalletConnect pairing QR code"
            // uqr renders the SVG from the pairing URI the relay produced; no
            // user input reaches it and nothing is fetched.
            dangerouslySetInnerHTML={{ __html: renderSVG(walletConnect.uri, { border: 1 }) }}
          />
          <a href={walletConnect.uri} className="mig-btn-plain">
            Open in a wallet app
          </a>
        </div>
      )}

      {wallets.length === 0 && !walletConnect?.available ? (
        <p className="mig-note">
          No wallet found in this browser. Install a wallet extension, or open this page inside your
          wallet&rsquo;s own browser.
        </p>
      ) : (
        <ul className="mig-wallets">
          {wallets.map((w) => (
            <li key={w.rdns}>
              <button
                type="button"
                disabled={connecting !== null}
                onClick={() => onPick(w.rdns)}
                className="mig-wallet"
              >
                {w.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a data: URI the wallet announced
                  <img src={w.icon} alt="" width={24} height={24} />
                ) : (
                  <span aria-hidden className="mig-wallet-blank" />
                )}
                <span className="mig-wallet-text">
                  <span className="mig-wallet-name">{w.name}</span>
                  <span className="mig-mono">{w.rdns}</span>
                </span>
                {connecting === w.rdns && <span className="mig-note">Confirm in your wallet…</span>}
              </button>
              {w.legacy && (
                <p className="mig-note">
                  Found through window.ethereum. With more than one extension installed, which one
                  answers is not under this page&rsquo;s control.
                </p>
              )}
            </li>
          ))}
          {walletConnect?.available && (
            <li>
              <button
                type="button"
                disabled={connecting !== null || walletConnect.pairing}
                onClick={walletConnect.onPick}
                className="mig-wallet"
              >
                <span aria-hidden className="mig-wallet-blank" />
                <span className="mig-wallet-text">
                  <span className="mig-wallet-name">WalletConnect</span>
                  <span className="mig-mono">any mobile or hardware wallet</span>
                </span>
                {walletConnect.pairing && <span className="mig-note">Opening…</span>}
              </button>
            </li>
          )}
        </ul>
      )}
      {error && (
        <p role="alert" className="mig-alert">
          {error}
        </p>
      )}
    </div>
  )
}
