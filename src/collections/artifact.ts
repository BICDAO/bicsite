import type { CollectionConfig, Field } from 'payload'

import { contentAccess, guardPublish } from '@/access/roles'
import { image, slug, text } from '@/fields/shared'
import { revalidate } from '@/hooks/revalidate'

/** Shared shape for treasury items (memes, liquid assets). */
export const artifactCollection = (collectionSlug: string, fields: Field[]): CollectionConfig => ({
  slug: collectionSlug,
  access: contentAccess,
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'creator', 'sortOrder', '_status'] },
  defaultSort: 'sortOrder',
  versions: { drafts: true },
  hooks: { beforeChange: [guardPublish], afterChange: [revalidate], afterDelete: [revalidate] },
  fields: [
    text('name', true),
    slug,
    text('creator'),
    ...fields,
    { name: 'description', type: 'textarea' },
    image('image'),
    image('thumbnail'),
    { name: 'sortOrder', type: 'number', index: true, admin: { position: 'sidebar' } },
  ],
})
