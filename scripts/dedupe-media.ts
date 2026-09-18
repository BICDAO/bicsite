/**
 * Remove media rows left behind by an early import run (idempotent, conservative).
 *
 *   pnpm payload run scripts/dedupe-media.ts            dry run: report what would be deleted
 *   pnpm payload run scripts/dedupe-media.ts commit     delete them
 *
 * (Positional word, not a --flag: `payload run` strips flags from argv.)
 *
 * The importer once matched an existing upload by exact filename. Payload appends "-1", "-2" when
 * a name collides, so re-uploading the same Webflow asset produced a second row and a second blob
 * instead of reusing the first. scripts/webflow.ts now matches on the Webflow asset id, so this is
 * a one-off cleanup of rows created before that fix — not an ongoing problem.
 *
 * Deliberately narrow. It only ever deletes a row that:
 *   - shares a Webflow asset id with at least one other row, and
 *   - is referenced by nothing, while exactly one of its siblings IS referenced.
 * Anything else — a lone unreferenced row, a group with no clear winner, a referenced row — is
 * reported and left alone. In particular an unreferenced row is NOT evidence that a file is unused:
 * the images belonging to unpublished drafts look unreferenced to any query that skips drafts.
 */
import config from '@payload-config'
import { getPayload } from 'payload'

const commit = process.argv.slice(2).includes('commit')

/** Webflow filenames start with a 24-hex asset id; that identifies the source file. */
const assetOf = (filename?: string | null) => filename?.match(/^[0-9a-f]{24}(?=_)/)?.[0] ?? null

const payload = await getPayload({ config })

// Every media id any content points at. `draft: true` is load-bearing: without it the images of
// unpublished items look unreferenced and would be deleted.
const referenced = new Set<number>()
const collect = (value: unknown, key?: string): void => {
  if (typeof value === 'number') {
    if (key && ['image', 'thumbnail', 'ogImage', 'media', 'icon'].includes(key)) referenced.add(value)
  } else if (Array.isArray(value)) {
    value.forEach((v) => collect(v))
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) collect(v, k)
  }
}

for (const collection of ['memes', 'liquid-assets'] as const) {
  const { docs } = await payload.find({ collection, depth: 0, pagination: false, draft: true })
  docs.forEach((d) => collect(d))
}
for (const slug of ['site', 'home', 'provenance'] as const) {
  collect(await payload.findGlobal({ slug, depth: 0 }))
}

const { docs: media } = await payload.find({ collection: 'media', depth: 0, pagination: false })

const groups = new Map<string, typeof media>()
for (const m of media) {
  const asset = assetOf(m.filename)
  if (!asset) continue
  groups.set(asset, [...(groups.get(asset) ?? []), m])
}

const doomed: typeof media = []
const skipped: string[] = []

for (const [asset, rows] of groups) {
  if (rows.length < 2) continue
  const used = rows.filter((r) => referenced.has(r.id))
  if (used.length !== 1) {
    skipped.push(
      `? ${asset}: ${rows.length} rows, ${used.length} referenced — left alone (needs a human)\n` +
        rows.map((r) => `    ${referenced.has(r.id) ? 'used  ' : 'unused'} #${r.id} ${r.filename}`).join('\n'),
    )
    continue
  }
  doomed.push(...rows.filter((r) => !referenced.has(r.id)))
}

const unreferencedSingletons = media.filter((m) => !referenced.has(m.id) && (groups.get(assetOf(m.filename) ?? '')?.length ?? 0) < 2)

console.log(`\n${media.length} media rows, ${referenced.size} referenced by content, ${groups.size} distinct Webflow assets\n`)
for (const s of skipped) console.log(s)
for (const m of doomed) console.log(`- #${m.id} ${m.filename}`)
if (unreferencedSingletons.length) {
  console.log(`\nunreferenced, but not duplicates — NOT touched (drafts look like this):`)
  for (const m of unreferencedSingletons) console.log(`  . #${m.id} ${m.filename}`)
}

if (!commit) {
  console.log(`\n${doomed.length} row(s) would be deleted (dry run — add \`commit\` to write)`)
} else {
  for (const m of doomed) await payload.delete({ collection: 'media', id: m.id })
  console.log(`\n${doomed.length} row(s) deleted`)
}

process.exit(0)
