import type Provider from '@walletconnect/universal-provider'
import { getAddress } from 'viem'
import { createConnector } from 'wagmi'

const NS = 'eip155'
const caip = (id: number) => `${NS}:${id}`

/**
 * WalletConnect connector on @walletconnect/universal-provider — no Reown/AppKit.
 * Emits the pairing URI as a `display_uri` message; the app renders its own QR.
 */
export function walletConnect({ projectId }: { projectId: string }) {
  let provider: Provider | undefined

  return createConnector<Provider>((config) => ({
    id: 'walletConnect',
    name: 'WalletConnect',
    type: 'walletConnect',

    async getProvider() {
      if (!provider) {
        const { UniversalProvider } = await import('@walletconnect/universal-provider')
        const origin = window.location.origin
        provider = await UniversalProvider.init({
          projectId,
          metadata: { name: 'Bureau of Internet Culture', description: 'Bureau of Internet Culture', url: origin, icons: [`${origin}/brand/bic-logo.svg`] },
        })
        provider.on('display_uri', (uri: string) => config.emitter.emit('message', { type: 'display_uri', data: uri }))
        provider.on('session_delete', () => this.onDisconnect())
        provider.on('accountsChanged', (accounts: string[]) => this.onAccountsChanged(accounts))
        provider.on('chainChanged', (chainId: string | number) => this.onChainChanged(String(chainId)))
      }
      return provider
    },

    async connect({ chainId, withCapabilities } = {}) {
      const p = await this.getProvider()
      const target = config.chains.find((c) => c.id === chainId) ?? config.chains[0]
      if (!p.session) {
        await p.connect({
          optionalNamespaces: {
            [NS]: {
              chains: config.chains.map((c) => caip(c.id)),
              methods: ['personal_sign', 'eth_sendTransaction', 'eth_signTypedData_v4', 'wallet_switchEthereumChain'],
              events: ['accountsChanged', 'chainChanged'],
              rpcMap: Object.fromEntries(config.chains.map((c) => [c.id, c.rpcUrls.default.http[0]])),
            },
          },
        })
      }
      p.setDefaultChain(caip(target.id))
      const accounts = await this.getAccounts()
      return {
        accounts: (withCapabilities ? accounts.map((address) => ({ address, capabilities: {} })) : accounts) as never,
        chainId: target.id,
      }
    },

    async disconnect() {
      await provider?.disconnect().catch(() => {})
    },

    async getAccounts() {
      const p = await this.getProvider()
      const raw = p.session?.namespaces[NS]?.accounts ?? []
      return [...new Set(raw.map((a) => getAddress(a.split(':')[2] ?? '')))]
    },

    async getChainId() {
      const p = await this.getProvider()
      return Number(String(p.namespaces?.[NS]?.defaultChain ?? config.chains[0].id).split(':').pop())
    },

    async isAuthorized() {
      return (await this.getAccounts()).length > 0
    },

    async switchChain({ chainId }) {
      const chain = config.chains.find((c) => c.id === chainId)
      if (!chain) throw new Error(`Chain ${chainId} not configured`)
      ;(await this.getProvider()).setDefaultChain(caip(chainId))
      config.emitter.emit('change', { chainId })
      return chain
    },

    onAccountsChanged(accounts) {
      if (!accounts.length) this.onDisconnect()
      else config.emitter.emit('change', { accounts: accounts.map((a) => getAddress(a)) })
    },

    onChainChanged(chainId) {
      config.emitter.emit('change', { chainId: Number(chainId) })
    },

    onDisconnect() {
      config.emitter.emit('disconnect')
    },
  }))
}
