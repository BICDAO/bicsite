# The NFD → BIC migration page

What `/migrate` does, what the contract behind it does, what the page checks
before it lets anyone sign, and the checklist that takes it from "not live" to
live and back.

Code: [`src/lib/migration.mjs`](../src/lib/migration.mjs) (pure — amounts, the
configuration rules, the thirteen checks, every sentence of copy, the flow
reducer, the ABI strings), [`src/components/migrate/`](../src/components/migrate/)
(the terminal), [`src/app/(frontend)/migrate/page.tsx`](../src/app/\(frontend\)/migrate/page.tsx)
(the explainer that wraps it), [`src/app/(frontend)/migrate.css`](../src/app/\(frontend\)/migrate.css)
(the styling, and why this page turns off the site-wide uppercase).

**This page and this document came from DeVamp on 2026-09-18** (BICDAO/bicsite#18,
deciding DeVamp issue #211): the DAO doing the migrating hosts the page that
asks wallets to sign. DeVamp keeps only what its treasury page needs — the
addresses and the rule that finds the migration pool — and its own
`docs/nfd-bic-migration.md` is now the cross-repo record. The original design
rationale is in that repo's HANDOFF.md §4b, and the traps in §9.

**Status on 2026-09-18: not live, but BIC now exists.** `BICToken` is deployed on
Ethereum mainnet at `0xB1cDa04D7cD5584048ab48B42b629aEC34D3b562`, source verified,
its whole supply at the treasury multisig. **The migration hook is not deployed**
and has no address. There will be no external audit — the owner ruled on
2026-09-12 that an LLM review pass plus testnet and mainnet-fork exercises stands
in its place (contracts repo, RUNBOOK §1b), and the page says so on its face
under *What was and was not reviewed*. Neither repo pins an address yet, and
`/migrate` is an explainer with no wallet control on it. Nothing below was read
from chain — there is nothing on chain to read. Contract behaviour comes from the
contracts repo's source (`src/MigratorHook.sol`, `src/BICToken.sol`, its README
and RUNBOOK), read on 2026-09-04; page behaviour comes from the code in this
repo, which is the source of truth wherever it and the build spec disagree.

## Why this is here

Feisty Doge is the Bureau's own liquid asset and BIC is the Bureau's own token,
so this is the DAO's page about the DAO's migration. It started on DeVamp,
which is the index that reviewed NFD's authenticity, and that was the right
place while the Bureau site was still a Webflow template nobody here could
change. It is not any more: a reader who has learned "the migration is on the
Bureau's site, linked from the Bureau's nav" has a rule that a phishing page
cannot satisfy, and one who has learned "the migration is wherever a link
points" has none.

A migration is exactly the moment look-alike pages appear, so the page says in
plain words what it will and will not ask for, and — until it is live — says
that nothing on this site asks a wallet for anything.

The Bureau never takes custody. Your wallet signs; the contract swaps. The page
never asks where to send tokens, never asks for a seed phrase, and never asks
for more than the amount you typed.

## The contract in plain words

`MigratorHook` is a Uniswap v4 hook that also exposes a direct converter. The
page uses the converter and nothing else — no router, no pool, no price:

| | |
|---|---|
| `migrate(amount, to)` | NFD → BIC, exactly `amount` raw units each way. The caller has approved the contract for NFD. Reverts `SwapsPaused()` while paused, `InsufficientInventory(available, required)` above `inventoryB()`, `ZeroAddress()` for a zero `to`. |
| `unmigrate(amount, to)` | BIC → NFD, exactly `amount`. The caller has approved the contract for BIC. **Cannot be paused.** Reverts `InsufficientEscrowBalance(available, required)` above `escrowedA()`. |
| `inventoryB()` | BIC the contract holds and can pay out. The **forward capacity**. Anyone can fund it (`InventoryFunded`); the treasury does, in tranches, which is why it moves. The owner can withdraw what is unused (`InventoryWithdrawn`). |
| `escrowedA()` | NFD that came in through migrations. The **reverse capacity**. Only a reverse migration can release any of it; there is no admin path to the escrow. |
| `paused()` | Forward only. Set by the owner (`PauseChanged`), for instance while the Feisty Doge vault is in an auction. |
| `owner()` | The community multisig, `0x8569FCa4fb54CE58228992CDA60bc920A574cf39`. Can pause forward and withdraw unused inventory. Cannot change the pair, the rate, or reach the escrow. |
| `tokenA()` / `tokenB()` | NFD (`0xDFDb7f72c1F195C5951a234e8DB9806EB0635346`, Ethereum mainnet) and BIC. Both 18 decimals; the contract refuses a mismatch at deploy. |
| `Migrated` / `Unmigrated` | `(sender, to, amount)`. What the page trusts as proof a migration happened. |

BIC itself is a plain 18-decimal ERC-20 with a fixed supply of
100,000,000,000, no owner, and a `treasury()` — the multisig — that its rescue
path pays to.

Two consequences worth stating rather than deriving:

- **Every migrated BIC stays redeemable for NFD by code.** The escrow is
  untouchable and the reverse cannot be paused. A holder who disagrees with the
  Bureau later can leave the same way they came in, at the same rate, without
  asking anyone.
- **A single transaction is capped by what the contract holds right now.** A
  holder with more NFD than the inventory has to split — migrate the inventory
  now, the rest after the next tranche. Nothing is lost by splitting; the rate
  is one for one every time. Going back, the escrow is the ceiling, and BIC
  bought elsewhere can exceed it.

## What the page shows, and when

### Not live (today)

The route prerenders as a static explainer. Headline *NFD to BIC, and back*,
then:

- **Not live yet** — *"This site is not set up to run the migration yet, so
  nothing here will ask your wallet for anything until it is. […] Until this
  page shows a wallet control, no page on this site migrates NFD — and nobody
  from the Bureau will message you a migration link. A site that asks you to
  approve a contract for NFD before this page does is not this migration."*
- **What is coming** — the five properties above, as a list.
- **What this page will check before it lets you sign** — the thirteen rows,
  rendered from the same `VERIFICATION_CHECKS` the live page checks against.
- **What actually happens**, **Who controls what**, **What was and was not
  reviewed** (there is no external audit and none is planned; the section names
  the escrow logic no third party has read and points at the pause lever),
  **Only the Ethereum mainnet NFD** (the Base and Solana versions of Feisty
  Doge are not visible to the contract), **Where to read more** (source
  *published at launch* until `CONTRACTS_REPO_PUBLIC` says otherwise; no audit
  line at all until `AUDIT_URL` holds a report to link — the page never claims
  a review that has not happened).

The sections after the terminal render in both states, so a reader who arrives
before launch and one who arrives after read the same explanation of what the
contract does.

**On DeVamp**, the Feisty Doge token page carries a notice — *Feisty Doge is
becoming BIC* — that links out to this page. It no longer reports whether the
migration is live: only this page knows that, because only this page reads the
chain, and a second source of truth for "is it safe to sign" is a second thing
that can be wrong. The BIC side of the same notice (*BIC redeems for NFD*) is
written and inert: that sheet's `BIC` row has no contract address, so no BIC
token page exists there yet.

### Live

Once configured, the explainer wraps the terminal. The terminal's shape is
decided by one derived state, **PAGE**, and nothing but its good state ever
shows a wallet control:

| PAGE | when | what the visitor sees |
|---|---|---|
| `checking` | first read in flight | dashes in the strip, *Reading the contracts…*, a disabled button saying the same |
| `unreachable` | no public node answered | dashes; *"Could not reach Ethereum through any public node. Nothing is known to be wrong with the contract; this page simply cannot see it right now."*; button *Not available* |
| `misconfigured` | an address fails its checksum, a capacity exceeds its token's supply, or any of the thirteen rows fails | *"These contracts do not check out. […] Nothing to do on your side — this is a configuration problem on ours."* with the failed rows listed by name; **no figures**; button *Not available* |
| `read-only` | all thirteen pass | the figures, the form, and the wallet layer |

"read-only" is the name of the *good* state: the reads are trustworthy, so the
wallet layer may render on top of them. A row that fails on a later poll pulls
the page back out and aborts any flow that was mid-signature.

**The strip** (readable with no wallet): *Forward capacity* — "BIC the contract
can pay out in one transaction"; *Reverse capacity* — "NFD in escrow,
redeemable now"; *Forward migration* — Open / Paused; *Reverse migration* —
"Cannot be paused". Under it, *Read at block N, Ms ago.* A figure with dropped
digits is prefixed ≈ and carries the exact value in its `title`; a nonzero
amount below four decimals shows as `<0.0001`, never `0`.

**Paused** adds a panel: *"Forward migration is paused. The community multisig
has stopped new NFD → BIC migrations for now — usually because the NFD vault is
in an auction. BIC → NFD still works; the contract cannot pause it."* The
reverse direction keeps working on the same page.

**The form**: a direction toggle (NFD → BIC / BIC → NFD), *Holds X NFD · Y BIC*
once connected, an amount input with **Max**, and under a valid amount the
preview — *You receive exactly N BIC*, the raw-unit integer "the same number the
contract moves", *One for one, no fee, no slippage, no price.* The help line
under the input says exactly why a number is refused:

| typed | help |
|---|---|
| commas, spaces, exponents, a minus | *Digits and one decimal point only. Commas, spaces and exponents are not accepted.* |
| a 19th decimal | *NFD has 18 decimal places; that number has more. This page will not round for you.* |
| `0` | *Nothing to send.* |
| more than the account holds | *That is more than this account holds: X NFD.* |
| more than the capacity | the split advice, plus a button *Use the available X* |
| anything, while paused, going forward | the paused sentence |

**The wallet layer**, in order: a picker listing the wallets the browser
announced (name, rdns, icon), or *"No wallet found in this browser. Install a
wallet extension, or open this page inside your wallet's own browser — this
page does not use WalletConnect."*; then *Connected 0x1234…abcd* with an
Etherscan link and *Forget this wallet* — "This page forgets the wallet. The
wallet's own permission for this site stays until you revoke it there."; then
the one red button. On the wrong network the button reads *Switch to Ethereum
mainnet* and a status line says which chain the wallet is on.

**Before you sign**, shown only in `read-only`: *"For one migration, two
prompts at most. The first is an approval: your wallet will show the spender as
`<hook>` and the amount as exactly what you typed — if it shows anything else,
reject it. The second is the migration itself, sending to the account you
connected. If your wallet lets you edit the approval amount and you lower it,
this page stops and asks again rather than sending a migration that would
fail. A transaction that fails on chain moves no tokens; it costs gas and
nothing more."*

**The log** (*This migration*) lists the two steps — *Approve N NFD*,
*Migrate N NFD to BIC* — each with a state word (Signing, Pending, Mined,
Declined, Cancelled, Replaced, Reverted, Failed, Not needed; always a word,
never colour alone) and its Etherscan link, then the aria-live sentence for the step. The
button labels and sentences, in order of a normal run:

| step | button | sentence |
|---|---|---|
| idle | *Approve N NFD* or *Migrate N NFD to BIC* | — |
| checking | *Checking…* | Checking the contract before asking your wallet. |
| approve-sign | *Confirm in your wallet…* | Confirm the approval of N NFD in your wallet. It is for exactly that amount. |
| approve-pending | *Waiting for Ethereum…* | Approval sent. Waiting for Ethereum. |
| approved | *Migrate N NFD to BIC* | Approved. Click again to confirm the migration in your wallet. |
| send-sign | *Confirm in your wallet…* | Confirm the migration of N NFD in your wallet. |
| send-pending | *Waiting for Ethereum…* | Migration sent. Waiting for Ethereum. |
| mined | *Migrate more* (*Redeem more* going back) | Done. N NFD went into escrow and N BIC arrived in 0x1234…abcd — confirmed from the transaction's own event. |
| failed | *Try again* | the reason, in one sentence |
| aborted | *Start again* | This flow stopped because the account, the network or the contract checks changed under it. Anything already sent is still on chain — see above. |
| stalled | *Still pending — follow it on Etherscan* | Still pending after ten minutes. Follow it on Etherscan; it stays on chain. Do not send a second one on top of it. |

Redeeming reads the same with the tokens reversed (*Redeem N BIC for NFD*).
Focus moves to the log heading when a migration mines, and the browser warns
before unload while a prompt or a receipt is outstanding.

## Four words chosen on purpose

**"Capacity", not "cap".** A cap sounds like a rule somebody set. These two
numbers are what the contract *holds right now* — BIC in inventory, NFD in
escrow — and both move: the treasury tops the inventory up in tranches, and
every forward migration adds to the escrow. The label says what the number is
("BIC the contract can pay out in one transaction") so that a holder who sees
it lower than their balance reads it as a queue, not a refusal.

**Max is min(balance, capacity).** Pressing Max has to produce a transaction
that can succeed. When the capacity is the binding one the page says so —
*"Max is the contract's room, not your balance: X of your Y NFD. Send the rest
in a second migration."* — because a Max that silently sent less than the
account holds would look like a bug or a theft, and it is neither.

**No recipient field, ever.** The account that signs is the account that
receives. Every phishing shape for a migration involves a field, a pre-filled
address, or a "send to your new wallet" story; this page has none, and it is
the last sentence on the form. Under the hood the contract's `to` argument is
filled with the connected account and the simulated request is asserted
against it before the wallet opens — a page bug that redirected tokens is not a
class of bug to trust a code review alone with.

**Exact approvals.** The approval is for exactly the amount typed and is used
up by the migration, so the next one asks again. An unlimited approval would be
a standing permission for the contract to take everything the account ever
holds, and nothing in the migration needs it. Because MetaMask lets a user edit
the amount in the prompt, the allowance is read back after the approval mines;
less than asked stops the flow with the two numbers rather than sending a
migration that would revert. A leftover allowance from an earlier run shows a
*Revoke* button that sets it back to zero.

## The thirteen reads

All must pass before the wallet control renders. The rows are rendered on the
page under *What this page checked* so a visitor can compare each one against
Etherscan without trusting this site for any of it.

| key | read | label on the page | what it catches |
|---|---|---|---|
| `rpcChainId` | `eth_chainId` from the public node == 1 | Reads come from Ethereum mainnet | a node on the wrong chain — the wallet's chain is checked separately |
| `hookCode` | `eth_getCode(hook)` is not empty | Contract code at the migration address | an EOA or a mistyped address, which answers every call with nothing |
| `bicCode` | `eth_getCode(bic)` is not empty | Contract code at the BIC address | same |
| `tokenA` | `hook.tokenA()` is NFD's mainnet address | The migration contract takes NFD | a hook for some other pair, or a token merely named NFD |
| `tokenB` | `hook.tokenB()` is the configured BIC | The migration contract pays BIC | the two configured addresses describing different deployments |
| `poolManager` | `hook.poolManager()` is the mainnet v4 PoolManager | The migration contract uses the Uniswap v4 PoolManager | a testnet or fork deployment |
| `owner` | `hook.owner()` is the community multisig | The migration contract is owned by the community multisig | a deployer-owned hook — the page blocks until the handover |
| `bicSymbol` | `BIC.symbol() == "BIC"` | BIC answers as BIC | |
| `bicDecimals` | `BIC.decimals() == 18` | BIC has 18 decimals | a one-for-one that is secretly ten-to-one |
| `bicSupply` | `BIC.totalSupply()` is exactly 100,000,000,000 × 10¹⁸ | BIC supply is 100,000,000,000 | a token with the right name and the wrong supply |
| `bicTreasury` | `BIC.treasury()` is the community multisig | BIC rescues to the community multisig | a BIC whose rescue path goes elsewhere |
| `nfdSymbol` | `NFD.symbol() == "NFD"` | The NFD address answers as NFD | the node not actually answering for that contract |
| `nfdDecimals` | `NFD.decimals() == 18` | NFD has 18 decimals | |

Plus one sanity check outside the thirteen: the inventory cannot exceed BIC's
supply and the escrow cannot exceed NFD's. A read that says otherwise is a wrong
contract or a wrong node, and the page shows dashes and *A capacity exceeds its
token's supply* rather than an impossible number.

⚠️ **What they do not catch.** A contract deliberately built with the real
NFD, the real BIC, the multisig as owner and the real PoolManager passes every
row. These catch mistakes — a pasted testnet address, a stale deployment, an env
var edited by the wrong hand. The control against a look-alike is that
production ignores the environment and goes live only through two constants
in `src/lib/migration.mjs`, changed by a reviewed pull request. See the checklist.

## The launch checklist

For whoever takes the page live. Each step exists because the page enforces
it, so skipping one produces a page that refuses, not a page that lies.

- [ ] **Deploy BIC.** Fixed supply, no owner, `treasury()` = the community
      multisig. The page checks all three.
- [ ] **Deploy the migration contract** (CREATE2-mined after BIC, per the
      contracts RUNBOOK). `tokenA()` must be the mainnet NFD, `tokenB()` this
      BIC, `poolManager()` the mainnet PoolManager.
- [ ] **Hand ownership to the multisig** (RUNBOOK §7). ⚠️ **The page blocks
      until `owner()` is `0x8569…cf39`.** A deployer-owned hook shows as
      `misconfigured` with *The migration contract is owned by the community
      multisig — failed*. That is the check working; do not loosen it to get
      past it.
- [ ] **Fund at least the smoke-test amount of inventory.** Forward capacity
      is `inventoryB()`; at zero every forward amount is "more than the contract
      can pay out in one go".
- [ ] **Set `NEXT_PUBLIC_MIGRATOR_HOOK` and `NEXT_PUBLIC_BIC_TOKEN` on a Preview
      deployment** of THIS project (`bicsite`) — both, in Vercel, scoped to
      Preview. Production ignores them on purpose.
- [ ] **Redeploy.** `NEXT_PUBLIC_` values are inlined at `next build`; an edit
      without a deploy changes nothing.
- [ ] **Open the preview in a REAL browser.** The in-app preview pane blocks
      cross-origin fetches on https origins, so every RPC read fails there and
      the strip reads `—` — the same trap as the images (HANDOFF §9). A
      dashboard of dashes in the pane means nothing either way.
- [ ] **All thirteen rows read `checked`**, and both capacities equal what
      Etherscan's *Read Contract* returns for `inventoryB()` and `escrowedA()`
      at that block.
- [ ] **Smoke-test a small amount forward, then back, from a throwaway
      account.** Watch for: the approval prompt shows the hook as spender and
      exactly the typed amount; the log ends in *confirmed from the
      transaction's own event*; the balances and both capacities move by
      exactly the amount; Etherscan agrees. Then the reverse, and a leftover
      allowance revoke.
- [ ] **PR setting `KNOWN_HOOK` and `KNOWN_BIC`** in `src/lib/migration.mjs`, and
      `CONTRACTS_REPO_PUBLIC` / `AUDIT_URL` if they are ready. This is the
      review step the whole design turns on — read the two addresses against
      the preview that was just tested, not against a message.
- [ ] **⚠️ PIN THE SAME PAIR IN DEVAMP.** `KNOWN_HOOK`/`KNOWN_BIC` in that
      repo's `lib/migration.mjs` are what let `/treasury` find the migration
      pool and count the escrowed NFD and undistributed BIC. Nothing automated
      compares the two repos. Pinning here and not there gives a live migration
      whose pool the treasury reports as absent; pinning there and not here
      gives a treasury figure for a migration nobody can use.
- [ ] **Production deploy.** Check `/migrate` here, and the Feisty Doge notice
      on DeVamp, in a real browser.
- [ ] **Announce** — from the Bureau's own channels. The page itself tells
      visitors nobody will message them a link, so nobody should.

**Rollback.** Two levers on the page and one on the contract, and they are not
the same thing:

- `NEXT_PUBLIC_MIGRATION_DISABLED=1` in Production, then redeploy. Minutes.
  Works in every environment, and can only ever turn the page *off*, which is
  why it is safe to leave in the dashboard's hands.
- A PR nulling `KNOWN_HOOK`/`KNOWN_BIC`. Slower, reviewed, and the one to use
  when the addresses themselves are the problem.
- **`setPaused` on the contract is the multisig's lever, not the page's.** It
  stops forward migrations for everyone, including people calling the contract
  from Etherscan; the page shows *Paused* within one poll and keeps the reverse
  direction working. Turning the page off stops nothing on chain — a holder can
  still `unmigrate` by hand, and always will be able to.

## The page-state matrix

| PAGE | wallet | the action area |
|---|---|---|
| `checking` | any | disabled *Reading the contracts…* |
| `unreachable` | any | disabled *Not available*; the strip says no node answered |
| `misconfigured` | any | disabled *Not available*; the failed rows above it |
| `read-only` | none | the wallet picker |
| `read-only` | connecting | the picker, *Confirm in your wallet…* beside the chosen entry |
| `read-only` | connected, wrong chain | balances shown; *Switch to Ethereum mainnet* |
| `read-only` | connected, mainnet, read older than 90s | disabled *Waiting for Ethereum…* until a poll lands |
| `read-only` | connected, mainnet, idle | *Enter an amount* / *Figures not read yet* / *More than this account holds* / *More than the contract can pay out in one go* / *Forward migration is paused* / *Approve N NFD* / *Migrate N NFD to BIC* |
| `read-only` | connected, flow in flight | the step's label, disabled; the form locked |

A reads failure, an account change or a network change during a signing step
aborts the flow; a network change during a *pending* step does not, because
the transaction is already on chain and the page is only watching for it.

## Still open

- **The pin PR** — `KNOWN_HOOK`/`KNOWN_BIC` are `null`; they wait on the
  preview smoke test above.
- **`AUDIT_URL`** is `null`, and is expected to stay that way: there is no
  external audit and none is planned. While it is null the page shows **no audit
  line at all**, which is the honest rendering. Set it only if a firm is ever
  engaged and publishes a report.
- **`CONTRACTS_REPO_PUBLIC`** is `false` (the repo was private on 2026-09-04);
  flip it when it is published and the page links the source.
- **The sheet's `BIC` row needs a contract address.** It has been on DeVamp's
  Memecoins tab since 29 August with none, so that parser drops it; the
  BIC-side notice there (`BIC_SLUG = 'bic'`) has nowhere to render until it
  has one. Nothing on this site depends on it.
- **WalletConnect**, if mobile demand appears. Today a phone reaches the page
  only through a wallet's in-app browser. ⚠️ Note that this repo already ships
  wagmi and a WalletConnect connector for the nav's CMS sign-in
  (`src/lib/wagmi.ts`, `src/components/ConnectModal.tsx`). Reusing them here is
  the obvious move and the one to think hardest about: sign-in and signing a
  transaction have different blast radii, and the migration reads and writes
  through its own client on purpose.
- **An `auctionState()` read on the NFD vault**, so the page could say *why*
  forward is paused rather than "usually because the NFD vault is in an
  auction" — after verifying the Fractional v1 ABI against the vault, not
  assuming it.
- **A past-migrations list** from `Migrated`/`Unmigrated` logs.
- **Confirm NFD's `approve` is OpenZeppelin-standard** — no USDT-style revert on
  a nonzero → nonzero allowance change — before launch. The page approves
  exactly the typed amount each time, so a leftover allowance followed by a new
  approval is the normal case, not an edge.
