# Bureau of Internet Culture

**The home base for [bureauofinternetculture.art](https://www.bureauofinternetculture.art).**

BIC collects and preserves culturally important memes and tokens, with provenance from their original creators. This repo is the site that shows that treasury. It is also where every BIC tool will live: mints, auctions, collection tools, the wiki, games, and wallet utilities.

It replaces the old Webflow site. The design and content are the same as before, but now they're in our own code, editable in our own CMS, and able to talk to wallets.

---

## What's in it today

- **The site.** The home page (hero, treasury, manifesto, creators), `/provenance`, and a page for every meme (`/memes/[slug]`) and token (`/liquid-assets/[slug]`). URLs match the old site exactly.
- **The CMS** at `/admin`. Editors manage memes, tokens, images and all page copy, with drafts, publishing and roles.
- **Wallet sign-in.** Sign-In With Ethereum, using any browser wallet or WalletConnect. Wallet users get normal accounts, ready for profiles, badges and gated apps.

## Where it's going

New things get their own URL on this site (`/bici`, `/prints`, …). Bigger standalone tools, like the asset manager, can live on subdomains. Planned next: wallet profiles showing owned assets, badges, leaderboards and achievements, and articles.

---

## Stack

Next.js 16 · Payload CMS 3 · Postgres (Neon in prod) · Vercel + Vercel Blob · wagmi 3 + viem · TypeScript

## Run it locally

You need Node 22+, Postgres, and pnpm via corepack (`corepack enable`).

```bash
cp .env.example .env          # set POSTGRES_URL and PAYLOAD_SECRET
pnpm install
pnpm payload migrate          # create tables
pnpm dev                      # uses the next free port
```

Then open `/admin` and create the first account. It automatically becomes the admin.

To load the site content, pull it from the live Webflow site and import it:

```bash
pnpm payload run scripts/webflow.ts fetch           # → migration/snapshot.json + images
pnpm payload run scripts/webflow.ts import          # dry run: shows what would change
pnpm payload run scripts/webflow.ts import commit   # write it
```

The import never deletes anything and skips anything that already exists; add `overwrite` to replace instead. Once Webflow is shut down, `fetch` will stop working and the production database + Blob storage become the source of truth.

## Everyday commands

| Task | Command |
| --- | --- |
| Dev server | `pnpm dev` |
| After changing a collection/global | `pnpm payload migrate:create <name>` → `pnpm payload migrate` |
| Regenerate TS types | `pnpm generate:types` |
| Typecheck | `pnpm exec tsc --noEmit` |
| Production build | `pnpm build` |
| Vercel build (migrate + build) | `pnpm run ci` |

---

## How it fits together

```
src/
  app/(frontend)/     the public site: pages, layout, webflow.css, site.css
  app/(payload)/      Payload admin + REST API (generated, rarely touched)
  collections/        Memes, LiquidAssets, Media, Users, Wallets
  globals/            Home, Provenance, Site (nav, footer, CTA)
  components/         shared UI (Nav, Footer, ItemPage, ConnectModal…)
  auth/siwe.ts        wallet sign-in endpoints
  access/roles.ts     who can do what
  lib/                data helpers, wagmi/chains config, formatting
scripts/webflow.ts    Webflow scraper / importer
migration/            snapshot.json: backup of the original Webflow content
```

- **Content.** Memes and tokens are collections with drafts. Page copy lives in three globals (Home, Provenance, Site). In headings, `~text~` dims text, `**text**` bolds it, and a new line becomes a line break.
- **Roles.** `admin` can do everything. `editor` and `dev` can edit and publish all content. `writer` can save drafts but can't publish. `user` (wallet or site users) has no admin access.
- **Styling.** `webflow.css` is the original Webflow CSS, trimmed to the rules we use. Its class names are what makes the site look identical, so keep them. `site.css` holds everything else: animations and new UI.
- **Wallets.** `/api/users/siwe/*` checks a signed message and starts the same Payload session that email login uses. WalletConnect only turns on when `NEXT_PUBLIC_WC_PROJECT_ID` is set. There's no third-party wallet modal: the connect UI is ours.
- **Adding an app.** Add a route folder under `src/app/(frontend)/<slug>/`. If it needs data, add its collections to `payload.config.ts`, then create a migration.

## Environment

| Variable | |
| --- | --- |
| `POSTGRES_URL` | Postgres connection string |
| `PAYLOAD_SECRET` | long random string (signs sessions) |
| `NEXT_PUBLIC_SITE_URL` | public URL (metadata, social previews) |
| `BLOB_READ_WRITE_TOKEN` | optional: Vercel Blob for media (local `/media` otherwise) |
| `NEXT_PUBLIC_WC_PROJECT_ID` | optional: enables WalletConnect |

## House rules

- **Protect the data.** Change the schema only through committed migrations; the database never auto-syncs. Never hand-edit the production DB.
- **Keep it lean.** Every dependency has to earn its place. Reuse before you add.
- **Deploy order.** Create the admin before opening wallet sign-in. Wallet sign-in stays disabled until at least one account exists.
