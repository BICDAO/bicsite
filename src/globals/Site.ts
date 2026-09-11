import type { GlobalConfig } from 'payload'

import { globalAccess } from '@/access/roles'
import { image, link, links, marked, text } from '@/fields/shared'
import { revalidate } from '@/hooks/revalidate'

export const Site: GlobalConfig = {
  slug: 'site',
  access: globalAccess,
  hooks: { afterChange: [revalidate] },
  fields: [
    { name: 'description', type: 'textarea', admin: { description: 'Meta description + footer tagline' } },
    image('ogImage'),
    {
      name: 'nav',
      type: 'group',
      fields: [
        link('cta'),
        {
          name: 'socials',
          type: 'array',
          fields: [
            { name: 'platform', type: 'select', required: true, options: ['x', 'discord', 'telegram', 'dexscreener'] },
            text('href', true),
          ],
        },
      ],
    },
    { name: 'cta', type: 'group', fields: [text('label'), marked('title'), link()] },
    {
      name: 'footer',
      type: 'group',
      fields: [
        links('orgLinks'),
        { name: 'memes', type: 'relationship', relationTo: 'memes', hasMany: true, admin: { description: '"Memes" column, in order' } },
        links('tokenLinks'),
        links('socialLinks'),
        text('contract'),
        text('copyright'),
      ],
    },
  ],
}
