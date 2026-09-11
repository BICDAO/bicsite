import type { GlobalConfig } from 'payload'

import { globalAccess } from '@/access/roles'
import { featureCard, image, link, marked, rich, text } from '@/fields/shared'
import { revalidate } from '@/hooks/revalidate'

export const Provenance: GlobalConfig = {
  slug: 'provenance',
  access: globalAccess,
  hooks: { afterChange: [revalidate] },
  fields: [
    { name: 'hero', type: 'group', fields: [marked('title'), text('subtitle'), image()] },
    {
      name: 'mission',
      type: 'group',
      fields: [
        text('label'),
        { name: 'blocks', type: 'array', fields: [marked('title'), rich('body')] },
        { name: 'link', type: 'group', fields: [marked('label'), text('href')] },
      ],
    },
    { name: 'records', type: 'group', fields: [text('label'), link(), text('note')] },
    { name: 'feature', type: 'group', fields: [text('label'), ...featureCard] },
  ],
}
