export const slugify = (s = '') =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/** Dates are stored as YYYY-MM-DDT12:00Z; display formats match the Webflow site. */
export const dateIso = (d?: string | null) => (d ? d.slice(0, 10) : '')

export const dateDots = (d?: string | null) => {
  if (!d) return ''
  const [y, m, day] = dateIso(d).split('-')
  return `${day}.${m}.${y}`
}

export const dateLong = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : ''

export const isExternal = (href: string) => /^https?:\/\//.test(href)

/** `0x1234…cdef`. Addresses are shown in full wherever there is room for them. */
export const shortAddress = (address: string) =>
  address.length <= 12 ? address : `${address.slice(0, 6)}…${address.slice(-4)}`

/** Populated relationship or undefined (Payload returns ids when not populated). */
export const rel = <T extends object>(x: number | T | null | undefined): T | undefined =>
  x && typeof x === 'object' ? x : undefined

export const rels = <T extends object>(xs?: (number | T)[] | null): T[] =>
  (xs ?? []).filter((x): x is T => typeof x === 'object')

/** Props for scroll-into-view reveal (see site.css). */
export const rv = (delay: number, kind: 'slide' | 'grow' | 'grow-big' = 'slide') => ({
  'data-reveal': kind,
  style: { '--d': `${delay}ms` } as React.CSSProperties,
})
