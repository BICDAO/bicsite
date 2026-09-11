import type { GlobalConfig } from 'payload'

import { globalAccess } from '@/access/roles'
import { featureCard, link, links, marked, text } from '@/fields/shared'
import { revalidate } from '@/hooks/revalidate'

const memeRow = (name: string) => ({ name, type: 'relationship' as const, relationTo: 'memes' as const, hasMany: true })

export const Home: GlobalConfig = {
  slug: 'home',
  access: globalAccess,
  hooks: { afterChange: [revalidate] },
  fields: [
    { name: 'hero', type: 'group', fields: [marked('title'), links('links'), memeRow('row1'), memeRow('row2')] },
    { name: 'explainer', type: 'group', fields: [text('label'), { name: 'cards', type: 'array', fields: featureCard }] },
    { name: 'treasury', type: 'group', fields: [text('label'), text('nftsLabel'), text('tokensLabel')] },
    {
      name: 'manifesto',
      type: 'group',
      fields: [
        text('label'),
        marked('title'),
        { name: 'items', type: 'array', fields: [marked('title'), { name: 'body', type: 'textarea' }] },
        link(),
      ],
    },
    { name: 'creators', type: 'group', fields: [text('label'), ...featureCard] },
  ],
}
