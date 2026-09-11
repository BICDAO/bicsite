import { text } from '@/fields/shared'

import { artifactCollection } from './artifact'

export const Memes = artifactCollection('memes', [
  { name: 'dateAcquired', type: 'date', admin: { date: { pickerAppearance: 'dayOnly' } } },
  {
    type: 'row',
    fields: [
      { name: 'isMemeNft', label: 'Meme NFT', type: 'checkbox' },
      { name: 'isToken', label: 'Token', type: 'checkbox' },
      { name: 'isPhysical', label: 'Physical', type: 'checkbox' },
    ],
  },
  text('knowYourMemeUrl'),
  text('provenanceUrl'),
])
