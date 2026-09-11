import type { CollectionConfig } from 'payload'

import { adminOnly, isAdmin } from '@/access/roles'

export const Wallets: CollectionConfig = {
  slug: 'wallets',
  admin: { useAsTitle: 'address', defaultColumns: ['address', 'user'] },
  access: {
    read: ({ req }) => isAdmin(req.user) || (req.user ? { user: { equals: req.user.id } } : false),
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  fields: [
    {
      name: 'address',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      hooks: { beforeValidate: [({ value }) => (typeof value === 'string' ? value.toLowerCase() : value)] },
      validate: (value: string | null | undefined) => /^0x[0-9a-f]{40}$/.test(value ?? '') || 'Invalid address',
    },
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true },
    // issuedAt of the last accepted SIWE message (replay guard)
    { name: 'lastSignIn', type: 'date', admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
  ],
}
