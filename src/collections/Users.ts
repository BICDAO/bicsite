import type { Access, CollectionConfig } from 'payload'

import { ROLES, adminField, adminOnly, isAdmin, isStaff } from '@/access/roles'
import { siweEndpoints } from '@/auth/siwe'

const selfOrAdmin: Access = ({ req }) => isAdmin(req.user) || (req.user ? { id: { equals: req.user.id } } : false)

export const Users: CollectionConfig = {
  slug: 'users',
  admin: { useAsTitle: 'username', defaultColumns: ['username', 'email', 'roles'] },
  // Wallet users: username = address, no email/password login used.
  auth: { loginWithUsername: { allowEmailLogin: true, requireEmail: false } },
  access: {
    admin: ({ req }) => isStaff(req.user),
    create: adminOnly,
    read: selfOrAdmin,
    update: selfOrAdmin,
    delete: adminOnly,
    unlock: adminOnly,
  },
  endpoints: siweEndpoints,
  hooks: {
    beforeChange: [
      async ({ data, operation, req, context }) => {
        // First account ever (admin "create first user") becomes admin — never a wallet sign-up.
        if (operation === 'create' && !context.siwe && !(await req.payload.count({ collection: 'users', req })).totalDocs) {
          data.roles = ['admin']
        }
        return data
      },
    ],
  },
  fields: [
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      options: [...ROLES],
      defaultValue: ['user'],
      required: true,
      saveToJWT: true,
      access: { create: adminField, update: adminField },
    },
    { name: 'wallets', type: 'join', collection: 'wallets', on: 'user' },
  ],
}
