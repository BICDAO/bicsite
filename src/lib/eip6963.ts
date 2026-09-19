import 'viem/window'
import type { EIP1193Provider } from 'viem'

/**
 * Wallet discovery, EIP-6963.
 *
 * Every wallet extension announces itself with a `CustomEvent` carrying its
 * name, an rdns identifier (`io.metamask`, `io.rabby`…) and its EIP-1193
 * provider; a page asks for those announcements by dispatching one event.
 * That replaces fighting over `window.ethereum`, which several extensions
 * overwrite in turn so that which one answers depends on install order.
 *
 * This is written as an external store for React's `useSyncExternalStore`:
 * the provider list lives here, React subscribes to changes, and no component
 * has to set state from an effect (which the hooks lint rules now reject).
 *
 * Two rules that are about safety rather than plumbing:
 *
 *  - THE FIRST ANNOUNCEMENT FOR AN rdns WINS. A later announcement claiming a
 *    trusted rdns cannot replace the entry the user may already have chosen.
 *    The picker prints the rdns beside the name so a shadowed one is visible.
 *  - THE PROVIDER OBJECTS NEVER LEAVE THIS MODULE. React receives plain,
 *    serialisable descriptions; `providerFor(rdns)` hands the provider to the
 *    wallet hook at the moment it is needed. Icons are kept only when they are
 *    `data:image/` URIs, which is what the standard requires.
 *
 * The `window.ethereum` fallback exists for wallets that predate EIP-6963 and
 * for in-wallet browsers that only inject. It appears after a short wait with
 * nothing announced, and is dropped the moment a real announcement arrives.
 */

export type WalletInfo = {
  rdns: string
  name: string
  icon: string | null
  /** True for the `window.ethereum` fallback, which has no rdns of its own. */
  legacy: boolean
}

type Entry = WalletInfo & { provider: EIP1193Provider }

type AnnounceDetail = {
  info?: { uuid?: string; name?: string; icon?: string; rdns?: string }
  provider?: EIP1193Provider
}

/** The pseudo-rdns of the `window.ethereum` fallback. Never persisted: it
 * names whichever extension owns that global today, not a wallet. */
export const LEGACY_RDNS = 'window.ethereum'

/** The pseudo-rdns of the WalletConnect option. Not an announced wallet: this
 * page registers it itself so a phone or a hardware wallet can pair by QR,
 * which EIP-6963 cannot reach — it only sees extensions in this browser. */
export const WALLETCONNECT_RDNS = 'walletconnect'
const LEGACY_WAIT_MS = 300

const EMPTY: readonly WalletInfo[] = Object.freeze([])
const entries = new Map<string, Entry>()
const listeners = new Set<() => void>()
let snapshot: readonly WalletInfo[] = EMPTY
let started = false

function publish() {
  // The window.ethereum guess is listed only while nothing has announced
  // itself. Once a real wallet has, the guess leaves the picker — but stays
  // in the map, because a user may already be connected through it and its
  // provider must keep answering.
  // WalletConnect is registered by this page, not announced by an extension,
  // so it must not count as evidence that a real wallet exists here — that
  // would suppress the window.ethereum fallback an in-wallet browser needs.
  const announced = [...entries.values()].some((e) => !e.legacy && e.rdns !== WALLETCONNECT_RDNS)
  snapshot = Object.freeze(
    [...entries.values()]
      .filter((e) => !announced || !e.legacy)
      .map(({ rdns, name, icon, legacy }) => ({ rdns, name, icon, legacy }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  )
  for (const listener of listeners) listener()
}

function isProvider(value: unknown): value is EIP1193Provider {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { request?: unknown }).request === 'function'
  )
}

function onAnnounce(event: Event) {
  const detail = (event as CustomEvent<AnnounceDetail>).detail
  const info = detail?.info
  const provider = detail?.provider
  if (!info || typeof info.rdns !== 'string' || info.rdns === '' || !isProvider(provider)) return
  if (entries.has(info.rdns)) return // first announcement wins
  const icon =
    typeof info.icon === 'string' && info.icon.startsWith('data:image/') ? info.icon : null
  const name =
    typeof info.name === 'string' && info.name.trim() !== '' ? info.name.trim() : info.rdns
  entries.set(info.rdns, { rdns: info.rdns, name, icon, legacy: false, provider })
  publish()
}

function start() {
  if (started || typeof window === 'undefined') return
  started = true
  window.addEventListener('eip6963:announceProvider', onAnnounce)
  window.dispatchEvent(new Event('eip6963:requestProvider'))
  window.setTimeout(() => {
    if (entries.size > 0) return
    const legacy = window.ethereum
    if (!isProvider(legacy)) return
    entries.set(LEGACY_RDNS, {
      rdns: LEGACY_RDNS,
      name: 'Browser wallet',
      icon: null,
      legacy: true,
      provider: legacy,
    })
    publish()
  }, LEGACY_WAIT_MS)
}

/** `useSyncExternalStore` subscribe. Discovery starts on the first subscriber. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  start()
  return () => {
    listeners.delete(listener)
  }
}

export function getSnapshot(): readonly WalletInfo[] {
  return snapshot
}

export function getServerSnapshot(): readonly WalletInfo[] {
  return EMPTY
}

/**
 * Register a provider the page made rather than one a browser extension
 * announced.
 *
 * The same first-wins rule applies, so this can never displace a wallet the
 * user may already be connected through, and the provider object stays inside
 * this module exactly as an announced one does.
 */
export function registerProvider(
  info: { rdns: string; name: string; icon?: string | null },
  provider: EIP1193Provider,
): void {
  if (entries.has(info.rdns)) return
  entries.set(info.rdns, {
    rdns: info.rdns,
    name: info.name,
    icon: typeof info.icon === 'string' && info.icon.startsWith('data:image/') ? info.icon : null,
    legacy: false,
    provider,
  })
  publish()
}

/** The provider behind an rdns, or null if it is not (or no longer) announced. */
export function providerFor(rdns: string): EIP1193Provider | null {
  return entries.get(rdns)?.provider ?? null
}
