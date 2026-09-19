# The Webflow 301 table, and the NFD links it replaces

Exported **2026-09-19** from the `bic-redesign` site, Site settings → Publishing, while the Webflow
subscription is still live. That table is invisible from outside the account and is destroyed when the
subscription lapses, so this file is the record.

## The redirect table — one row

| Old path | New path |
| --- | --- |
| `/about` | `/provenance` |

**That is the whole table.** Issue #9 called the 301 export "the single most common thing lost in a
Webflow migration" and treated it as a serious unknown; it turned out to be a single rule. It is now in
`next.config.ts` as a permanent (308) redirect.

**Verify after cutover:** `curl -sI https://www.bureauofinternetculture.art/about` should return `308`
with `location: /provenance`.

## The 34 template URLs are deliberately NOT redirected

Issue #9's second half: 34 of the 87 URLs on the Webflow site are unedited pages from the purchased
NextWave template — `/pricing`, `/contact`, `/project/*`, `/blog/*`, `/service/*`, `/checkout` and so on.
They carry no BIC content and are correctly dropped. **They now return the branded 404** added in #8 and
#17, which is the right outcome: a 404 tells a search engine the page is gone, while a redirect to the
homepage tells it the page moved there, and soft-404s of that kind are worse for the domain than honest
ones.

**`/contact` is the one worth a second look.** It hosted a live, crawlable form whose submissions live
only in Webflow (see below), and it is the most likely of the 34 to have inbound links.

## Superseded NFD links

Every place the site points at NFD where it will eventually point at BIC. **None of these should change
until the matching BIC destination exists** — a dead link is worse than an accurate old one.

| Where | Current target | Replace when |
| --- | --- | --- |
| Footer → ETHERSCAN | `etherscan.io/token/0xdfdb7f72c1f195c5951a234e8db9806eb0635346` | **Now — safe.** BIC's page exists at `0xB1cDa04D7cD5584048ab48B42b629aEC34D3b562` |
| Footer → COINGECKO | `coingecko.com/en/coins/feisty-doge-nft` | Only once BIC is listed. No BIC page exists |
| Footer → COINMARKETCAP | `coinmarketcap.com/currencies/feisty-doge-nft/` | Only once BIC is listed |
| Nav CTA + footer "BUY OUR TOKEN" | `swap.defillama.com/?chain=ethereum&from=0x0000…0000&to=0xdfdb7f72…5346` | Only once BIC has a funded pool. Pointing it at BIC earlier sends buyers to a swap that cannot fill |
| Footer `contract` field | `0xDFDb7f72c1F195C5951a234e8DB9806EB0635346` | At cutover or launch, alongside the Etherscan link |
| Home explainer card 3 | Title `~OWNING / ~$NFD`, body "Holding $NFD gives you fractional ownership…" | **This is the one that blocks listings** — see below |

**Where these live:** all of them are CMS content, not code. `migration/snapshot.json` is a *scrape of the
Webflow site* produced by `scripts/webflow.ts fetch` and consumed only by a manual `import`; nothing seeds
from it on deploy, so editing it changes nothing live. The live copy is in Payload and is edited at
`/admin`.

## Why the explainer card matters beyond tidiness

Ethplorer's token form states: *"make sure the website is functional and describes this token from the
first page. Otherwise, the update will not be accepted."* Blockscout, DexScreener and CoinGecko all apply
a similar check. **The first page currently describes `$NFD` and never names BIC**, so a reviewer
following that instruction has grounds to reject. A BIC submission is already filed with Ethplorer
(2026-09-19).

Suggested replacement, keeping `$NFD` named so holders arriving from the NFD listings still recognise it:

> **$BIC** — a stake in the treasury. Holding $BIC gives you fractional ownership of THE meme treasury and
> GOVERNANCE VOTING RIGHTS. **$BIC succeeds $NFD, converted one-for-one.**

## Other Webflow-only data, checked the same day

Issue #11 lists four things that die with the subscription. Three are now known:

- **301 redirects** — above. One row, exported.
- **Form submissions** — the `Email Form` has submissions, **almost all spam**. Nine distinct sender
  addresses across the visible rows, of which one, `sales@bureauofinternetculture.art`, may be genuine.
  Webflow's own Spam tab is separate. **Not yet exported** — decide whether it is worth keeping.
- **Ecommerce orders** — **none, and the premise was wrong.** #11 says "the site has an Ecommerce section
  enabled"; the Plans page shows only upgrade options on the Ecommerce tab and no active ecommerce plan,
  so there are no orders to lose.
- **Billing** — **CMS plan, $29/mo + tax. Current period 18 September – 18 October 2026, billed monthly.**
  **18 October 2026 is the real deadline** for anything still inside Webflow. The workspace is *Reuben's
  Workspace* (Freelancer), while the card on file is in Leon Fraser Bryan's name — **the DAO owns
  neither**, which is the same ownership gap issue #7 raises for the Vercel project.
