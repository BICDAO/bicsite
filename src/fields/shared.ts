import type { Field } from 'payload'

import { slugify } from '@/lib/format'

export const text = (name: string, required = false): Field => ({ name, type: 'text', required })

/** Heading text rendered by <Marked>. */
export const marked = (name: string): Field => ({
  name,
  type: 'textarea',
  admin: { description: '~text~ = dimmed, **text** = bold, new line = line break' },
})

export const rich = (name: string): Field => ({ name, type: 'richText' })

export const image = (name = 'image'): Field => ({ name, type: 'upload', relationTo: 'media' })

export const link = (name = 'link'): Field => ({ name, type: 'group', fields: [text('label'), text('href')] })

export const links = (name: string): Field => ({
  name,
  type: 'array',
  fields: [text('label', true), text('href', true)],
})

export const slug: Field = {
  name: 'slug',
  type: 'text',
  required: true,
  unique: true,
  index: true,
  admin: { position: 'sidebar' },
  hooks: { beforeValidate: [({ value, data }) => value || slugify(data?.name)] },
}

/** Card used by home explainer/creators and the provenance feature block. */
export const featureCard: Field[] = [
  text('category'),
  marked('title'),
  text('subtitle'),
  rich('body'),
  link(),
  image(),
]
