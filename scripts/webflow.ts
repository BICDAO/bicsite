/**
 * Webflow → Payload migration (idempotent, never deletes).
 *
 *   pnpm payload run scripts/webflow.ts fetch                 scrape live site → migration/snapshot.json + migration/images/
 *   pnpm payload run scripts/webflow.ts import                dry run: report what would be written
 *   pnpm payload run scripts/webflow.ts import commit         create missing media/docs/globals
 *   ... import commit overwrite                               also replace existing docs/globals with snapshot data
 *
 * (Positional words, not --flags: `payload run` strips flags from argv.)
 */
import fs from 'node:fs/promises'
import path from 'node:path'

import config from '@payload-config'
import { convertHTMLToLexical, editorConfigFactory } from '@payloadcms/richtext-lexical'
import { JSDOM } from 'jsdom'
import { getPayload } from 'payload'

const SITE = 'https://www.bureauofinternetculture.art'
const DIR = path.resolve('migration')
const IMG_DIR = path.join(DIR, 'images')
const SNAPSHOT = path.join(DIR, 'snapshot.json')

const [cmd, ...flags] = process.argv.slice(2)

// ---------- DOM helpers ----------
const $ = (root: ParentNode | null | undefined, sel: string) => root?.querySelector(sel) ?? null
const $$ = (root: ParentNode | null | undefined, sel: string) => [...(root?.querySelectorAll(sel) ?? [])]
const clean = (s: string) => s.replace(/‍/g, '')
const visible = (el: Element) => !el.classList.contains('w-condition-invisible') && !el.classList.contains('w-dyn-bind-empty')
const txt = (el: Element | null | undefined) => (el && visible(el) ? clean(el.textContent ?? '').trim() : '')
const href = (el: Element | null | undefined) => (el && visible(el) ? (el.getAttribute('href') ?? '') : '')
const src = (el: Element | null | undefined) => el?.getAttribute('src') ?? ''
const slugOf = (a: Element | null) => href(a).split('/').pop() ?? ''
const rich = (el: Element | null) => (el ? clean(el.innerHTML).trim() : '')

/** Text as the browser shows it: source whitespace collapsed, <br> → newline. */
const multiline = (el: Element | null) => {
  if (!el || !visible(el)) return ''
  const c = el.cloneNode(true) as Element
  c.querySelectorAll('br').forEach((br) => br.replaceWith('\u0001'))
  return clean(c.textContent ?? '')
    .replace(/\s+/g, ' ')
    .split('\u0001')
    .map((line) => line.trim())
    .join('\n')
    .trim()
}

/** Heading HTML → <Marked> syntax: ~dim~, **bold**, newline. */
const marked = (el: Element | null): string => {
  const walk = (n: Node): string => {
    if (n.nodeType === 3) return clean(n.textContent ?? '')
    if (n.nodeType !== 1) return ''
    const e = n as Element
    if (e.tagName === 'BR') return '\n'
    const inner = [...e.childNodes].map(walk).join('')
    if (e.classList.contains('half-opacity')) return `~${inner}~`
    if (e.tagName === 'STRONG' || e.tagName === 'B') return `**${inner}**`
    return inner
  }
  return el ? [...el.childNodes].map(walk).join('').trim() : ''
}

const arrowLink = (a: Element | null) => ({ label: txt($(a, '.hero-link-title-text')), href: href(a) })
const label = (section: Element | null) => txt($(section, '.section-top-wrap .section-sub-title'))
const card = (item: Element | null) => ({
  category: txt($(item, '.blog-v1-ctg-text')),
  title: marked($(item, '.blog-v1-single-title-large')),
  subtitle: txt($(item, '.blog-v1-subtitle')),
  bodyHtml: rich($(item, '.blog-v1-paragraph')),
  link: arrowLink($(item, 'a.hero-single-link-wrap')),
})
const featureSection = (section: Element | null) => ({
  label: label(section),
  ...card($(section, '.blog-v1-cl-item-wrap')),
  image: src($(section, '.blog-v1-cl-item-wrap-copy img')),
})

const get = async (p: string) => {
  const res = await fetch(SITE + p)
  if (!res.ok) throw new Error(`${res.status} ${p}`)
  return new JSDOM(await res.text()).window.document
}

const pool = async <T>(items: T[], n: number, fn: (t: T) => Promise<void>) => {
  let i = 0
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]) }))
}

/** Local, upload-safe filename for a Webflow CDN URL (Webflow prefixes a unique id). */
const fileOf = (url: string) => decodeURIComponent(url.split('/').pop() ?? '').replace(/[^\w.-]+/g, '-')

// ---------- fetch ----------
async function fetchSite() {
  const home = await get('/')
  const [memeList, assetList] = $$(home, '#Treasury .treasury-v1-flex-wrap')

  const memes = await Promise.all(
    $$(memeList, '.collection-item').map(async (row, i) => {
      const slug = slugOf($(row, 'a'))
      const tags = $$(row, '.treasury-tag-meme').map(txt)
      const page = await get(`/memes/${slug}`)
      const [left, right] = $$(page, '.meme-page-item-container')
      const links = $$(left, 'a.project-client-name')
      return {
        slug,
        name: txt($(row, '.treasury-title')),
        creator: txt($(row, '.treasury-third-column .treasury')),
        dateAcquired: txt($(row, '.treasury-fourth-column .awards-single-text')),
        isMemeNft: tags.includes('Meme NFT'),
        isToken: tags.includes('Token'),
        isPhysical: tags.includes('Physical'),
        knowYourMemeUrl: href(links.find((a) => /knowyourmeme/i.test(txt(a))) ?? null),
        provenanceUrl: href(links.find((a) => /provenance/i.test(txt(a))) ?? null),
        description: multiline($(right, '.project-client-description')),
        image: src($(page, '.meme-page-image')),
        thumbnail: src($(row, '.image-6')),
        sortOrder: i,
      }
    }),
  )

  const liquidAssets = await Promise.all(
    $$(assetList, '.collection-item').map(async (row, i) => {
      const slug = slugOf($(row, 'a'))
      const page = await get(`/liquid-assets/${slug}`)
      const [left, right] = $$(page, '.meme-page-item-container')
      return {
        slug,
        name: txt($(row, '.treasury-title')),
        ticker: txt($(row, '.liquid-assets-second-column .treasury-tag-meme')),
        creator: txt($(row, '.treasury-third-column .treasury')),
        blockchain: txt($(row, '.treasury-fourth-column .awards-single-text')),
        coingeckoUrl: href($$(left, 'a.project-client-name').find((a) => /coingecko/i.test(txt(a))) ?? null),
        description: multiline($(right, '.project-client-description')),
        image: src($(page, '.meme-page-image')),
        thumbnail: $(page, 'meta[property="og:image"]')?.getAttribute('content') ?? '',
        sortOrder: i,
      }
    }),
  )

  const rowSlugs = (sel: string) => $$($$(home, sel)[0], 'a.header-item-link-block').map(slugOf)
  const treasury = $(home, '#Treasury')
  const manifesto = $(home, '#Provenance')
  const cols = $$(home, '.footer-single-wrap')
  const platform = (s: string) => (/discord/i.test(s) ? 'discord' : /telegram/i.test(s) ? 'telegram' : /dexscreener/i.test(s) ? 'dexscreener' : 'x')
  const linksIn = (el: Element | null) => $$(el, 'a').map((a) => ({ label: txt(a), href: href(a) }))

  const site = {
    description: $(home, 'meta[name="description"]')?.getAttribute('content') ?? '',
    ogImage: $(home, 'meta[property="og:image"]')?.getAttribute('content') ?? '',
    nav: {
      cta: (() => {
        const a = $$(home, '.nav-link').find((l) => !l.classList.contains('hidden')) ?? null
        return { label: txt(a), href: href(a) }
      })(),
      socials: $$(home, '.social-icon-navbar').map((a) => ({ platform: platform(src($(a, 'img'))), href: href(a) })),
    },
    cta: {
      label: txt($(home, '#Footer .section.cta .section-sub-title')),
      title: marked($(home, '#Footer h2.cta-title')),
      link: { label: txt($(home, '#Footer .secondary-btn-text')), href: href($(home, '#Footer a.secondary-button')) },
    },
    footer: {
      orgLinks: linksIn(cols[0]),
      memes: $$(cols[1], 'a').map(slugOf),
      tokenLinks: linksIn(cols[2]),
      socialLinks: $$(home, '.footer-social-link').map((a) => ({ label: txt($(a, '.footer-social-text')), href: href(a) })),
      contract: txt($$(home, '.footer-copyright-text')[0]),
      copyright: txt($$(home, '.footer-copyright-text')[1]),
    },
  }

  const homeData = {
    hero: {
      title: marked($(home, 'h1.hero-title')),
      links: $$(home, '.hero-social-wrap a.hero-single-link-wrap').map(arrowLink),
      row1: rowSlugs('.collection-list-wrapper-header-one'),
      row2: rowSlugs('.collection-list-wrapper-header-two'),
    },
    explainer: { label: label($(home, '#Explainer')), cards: $$(home, '#Explainer .blog-v1-cl-item-wrap').map(card) },
    treasury: {
      label: label(treasury),
      nftsLabel: txt($$(treasury, '.liquid-assets-header .section-sub-title')[0]),
      tokensLabel: txt($$(treasury, '.liquid-assets-header .section-sub-title')[1]),
    },
    manifesto: {
      label: label(manifesto),
      title: marked($(manifesto, 'h2.about-v1-details')),
      items: $$(manifesto, '.awards-v1-single-warp').map((a) => ({
        title: marked($$(a, '.awards-v1-single-title-wrap .awards-single-text')[1] ?? null),
        body: txt($(a, '.awards-v1-single-flex-wrap-dropdown em')),
      })),
      link: arrowLink($(manifesto, '.manifesto-section-link a')),
    },
    creators: featureSection($(home, '#Creators')),
  }

  const prov = await get('/provenance')
  const mission = $(prov, '.section.mission')
  const records = $(prov, '.section.about-v1')
  const provenance = {
    hero: {
      title: marked($(prov, 'h1.about-title')),
      subtitle: txt($(prov, '.section-middle-wrap .section-sub-title')),
      image: src($(prov, '.about-image')),
    },
    mission: {
      label: label(mission),
      blocks: $$(mission, 'h3.mission-title').map((h) => ({ title: marked(h), bodyHtml: rich(h.nextElementSibling) })),
      link: { label: marked($(mission, 'a.member-name')), href: href($(mission, 'a.member-name')) },
    },
    records: {
      label: label(records),
      link: { label: txt($(records, 'a.about-v1-details')), href: href($(records, 'a.about-v1-details')) },
      note: txt($(records, 'h2.about-v1-details')),
    },
    feature: featureSection($(prov, '#Creators')),
  }

  const snapshot = { source: SITE, fetchedAt: new Date().toISOString(), memes, liquidAssets, site, home: homeData, provenance }

  // Download every CDN image referenced by the snapshot (skips files already present).
  const urls = [...new Set(JSON.stringify(snapshot).match(/https:\/\/cdn\.prod\.website-files\.com\/[^"]+/g) ?? [])]
  await fs.mkdir(IMG_DIR, { recursive: true })
  await pool(urls, 6, async (url) => {
    const file = path.join(IMG_DIR, fileOf(url))
    if (await fs.stat(file).catch(() => null)) return
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${res.status} ${url}`)
    await fs.writeFile(file, Buffer.from(await res.arrayBuffer()))
  })

  await fs.writeFile(SNAPSHOT, JSON.stringify(snapshot, null, 2) + '\n')
  console.log(`snapshot: ${memes.length} memes, ${liquidAssets.length} liquid assets, ${urls.length} images → ${path.relative(process.cwd(), DIR)}`)
}

// ---------- import ----------
type Snapshot = Awaited<ReturnType<typeof readSnapshot>>
const readSnapshot = async () => JSON.parse(await fs.readFile(SNAPSHOT, 'utf8')) as {
  memes: Record<string, string | number | boolean>[]
  liquidAssets: Record<string, string | number | boolean>[]
  site: any // eslint-disable-line @typescript-eslint/no-explicit-any
  home: any // eslint-disable-line @typescript-eslint/no-explicit-any
  provenance: any // eslint-disable-line @typescript-eslint/no-explicit-any
}

async function importSite(commit: boolean, overwrite: boolean) {
  const snap: Snapshot = await readSnapshot()
  const payload = await getPayload({ config })
  const editorConfig = await editorConfigFactory.default({ config: payload.config })
  const lexical = (html: string) => (html ? convertHTMLToLexical({ editorConfig, html, JSDOM }) : null)
  const log: string[] = []

  const media = async (url: string, alt: string): Promise<number | null> => {
    if (!url) return null
    const filename = fileOf(url)
    // Webflow names start with a unique 24-hex asset id. Payload may suffix uploads ("-1") when a name
    // clashes (it also checks the local media/ dir), so match on the id, not the exact filename.
    const assetId = filename.match(/^[0-9a-f]{24}(?=_)/)?.[0]
    const where = assetId ? { filename: { like: `${assetId}_` } } : { filename: { equals: filename } }
    const { docs } = await payload.find({ collection: 'media', where, limit: 1 })
    if (docs[0]) return docs[0].id
    log.push(`+ media ${filename}`)
    if (!commit) return null
    return (await payload.create({ collection: 'media', data: { alt }, filePath: path.join(IMG_DIR, filename) })).id
  }

  const upsert = async (collection: 'memes' | 'liquid-assets', item: Record<string, string | number | boolean>, data: object) => {
    const slug = String(item.slug)
    const { docs } = await payload.find({ collection, where: { slug: { equals: slug } }, limit: 1, draft: true })
    const existing = docs[0]
    if (existing && !overwrite) return existing.id
    log.push(`${existing ? '~' : '+'} ${collection}/${slug}`)
    if (!commit) return existing?.id
    const doc = { ...data, _status: 'published' as const }
    return existing
      ? (await payload.update({ collection, id: existing.id, data: doc })).id
      : (await payload.create({ collection, data: doc as never })).id
  }

  const memeIds = new Map<string, number>()
  for (const m of snap.memes) {
    const name = String(m.name)
    const id = await upsert('memes', m, {
      ...m,
      dateAcquired: m.dateAcquired ? `${m.dateAcquired}T12:00:00.000Z` : null,
      image: await media(String(m.image), name),
      thumbnail: await media(String(m.thumbnail), name),
    })
    if (id) memeIds.set(String(m.slug), id)
  }

  const CHAINS = ['Ethereum', 'Solana', 'Base']
  for (const a of snap.liquidAssets) {
    const name = String(a.name)
    if (a.blockchain && !CHAINS.includes(String(a.blockchain))) throw new Error(`Unknown blockchain "${a.blockchain}" on ${a.slug}`)
    await upsert('liquid-assets', a, {
      ...a,
      blockchain: a.blockchain || null,
      image: await media(String(a.image), name),
      thumbnail: await media(String(a.thumbnail), name),
    })
  }

  const toCard = async (c: { bodyHtml: string; image?: string; [k: string]: unknown }, alt: string) => {
    const { bodyHtml, image, ...rest } = c
    return { ...rest, body: lexical(bodyHtml), ...(image !== undefined && { image: await media(image, alt) }) }
  }

  const global = async (slug: 'site' | 'home' | 'provenance', hasContent: (g: Record<string, unknown>) => boolean, build: () => Promise<object>) => {
    const current = (await payload.findGlobal({ slug })) as unknown as Record<string, unknown>
    const filled = hasContent(current)
    if (filled && !overwrite) return
    log.push(`${filled ? '~' : '+'} global ${slug}`)
    const data = await build()
    if (commit) await payload.updateGlobal({ slug, data: data as never })
  }

  const { site, home, provenance } = snap
  const ids = (slugs: string[] = []) => slugs.map((s) => memeIds.get(s)).filter(Boolean)
  await global('site', (g) => Boolean(g.description), async () => ({
    ...site,
    ogImage: await media(site.ogImage, 'Bureau of Internet Culture'),
    footer: { ...site.footer, memes: ids(site.footer.memes) },
  }))
  await global('home', (g) => Boolean((g.hero as { title?: string })?.title), async () => ({
    ...home,
    hero: { ...home.hero, row1: ids(home.hero.row1), row2: ids(home.hero.row2) },
    explainer: { ...home.explainer, cards: await Promise.all(home.explainer.cards.map((c: never) => toCard(c, ''))) },
    creators: await toCard(home.creators, 'Creators'),
  }))
  await global('provenance', (g) => Boolean((g.hero as { title?: string })?.title), async () => ({
    ...provenance,
    hero: { ...provenance.hero, image: await media(provenance.hero.image, 'Provenance banner') },
    mission: { ...provenance.mission, blocks: provenance.mission.blocks.map((b: { title: string; bodyHtml: string }) => ({ title: b.title, body: lexical(b.bodyHtml) })) },
    feature: await toCard(provenance.feature, 'Feisty Doge NFT'),
  }))

  console.log(log.length ? log.join('\n') : 'nothing to do — everything already imported')
  console.log(`\n${log.length} change(s) ${commit ? 'written' : '(dry run — add `commit` to write)'}`)
}

if (cmd === 'fetch') await fetchSite()
else if (cmd === 'import') await importSite(flags.includes('commit'), flags.includes('overwrite'))
else console.log('usage: payload run scripts/webflow.ts fetch | import [commit] [overwrite]')
process.exit(0)
