import { text } from '@/fields/shared'

import { artifactCollection } from './artifact'

export const LiquidAssets = artifactCollection('liquid-assets', [
  text('ticker'),
  { name: 'blockchain', type: 'select', options: ['Ethereum', 'Solana', 'Base'] },
  text('coingeckoUrl'),
])
