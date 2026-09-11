import type { CollectionConfig } from 'payload'

import { publishersOnly, staffOnly } from '@/access/roles'

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: () => true,
    create: staffOnly,
    update: staffOnly,
    delete: publishersOnly,
  },
  fields: [{ name: 'alt', type: 'text', required: true }],
  upload: true,
}
