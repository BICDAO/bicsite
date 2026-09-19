import type { Metadata } from 'next'

import { MigrationTerminal } from '@/components/migrate/MigrationTerminal'
import { A, Container, SectionTop } from '@/components/ui'
import { explorer } from '@/lib/explorer'
import { shortAddress } from '@/lib/format'
import {
  AUDIT_URL,
  COMMUNITY_MULTISIG,
  CONTRACTS_REPO_PUBLIC,
  CONTRACTS_REPO_URL,
  DEVAMP_URL,
  NFD_ADDRESS,
  NFD_ASSET_SLUG,
  NFD_REVIEW_URL,
  VERIFICATION_CHECKS,
} from '@/lib/migration'
import { migrationConfig } from '@/lib/migrationConfig'
import { rv } from '@/lib/format'

import '../migrate.css'

/**
 * NFD -> BIC, and back.
 *
 * A server component with two shapes. Until the contracts are deployed and
 * configured, this is the explainer: what is coming, what the page will check,
 * and — because a migration is exactly the moment phishing pages appear — a
 * plain statement that nothing on this site asks a wallet for anything until
 * this page shows a wallet control. Once configured, the same explainer wraps
 * `MigrationTerminal`, the client component that reads the chain and drives
 * the two transactions.
 *
 * No `revalidate`, no `dynamic`: the page has no server-side data and does not
 * touch Payload. The addresses are build-time environment (see
 * lib/migrationConfig.ts) and every on-chain read happens in the browser, so
 * the route prerenders and `Link` prefetches it whole.
 */

const config = migrationConfig()
const live = config.state === 'configured'

export const metadata: Metadata = {
  title: 'Migrate NFD to BIC',
  description: live
    ? 'Feisty Doge (NFD) becomes BIC one for one, and back again, on Ethereum mainnet. Live capacity in both directions, no fee, no price impact.'
    : 'Feisty Doge (NFD) becomes BIC one for one, and back again. Not live yet: the contracts are not deployed.',
}

function Section({
  tone = 'plain',
  role,
  children,
}: {
  tone?: 'plain' | 'notice'
  role?: 'status'
  children: React.ReactNode
}) {
  return (
    <section role={role} className={`mig-panel${tone === 'notice' ? ' notice' : ''}`}>
      {children}
    </section>
  )
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mig-h2">{children}</h2>
}

function Out({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="mig-link">
      {children} ↗
    </a>
  )
}

const READING = (hook: string | null, bic: string | null) =>
  [
    CONTRACTS_REPO_PUBLIC
      ? {
          label: 'Contracts source',
          href: CONTRACTS_REPO_URL,
          note: 'The migration hook, the BIC token, tests and the runbook.',
        }
      : { label: 'Source is published at launch.', href: null, note: null },
    // No audit line until there is a report to link. There is no external
    // audit planned (see "What was and was not reviewed" below); if one is
    // ever commissioned and published, AUDIT_URL is where it goes.
    ...(AUDIT_URL
      ? [
          {
            label: 'Audit report',
            href: AUDIT_URL,
            note: 'The independent review of the contracts.',
          },
        ]
      : []),
    ...(hook
      ? [{ label: 'Migration contract on Etherscan', href: explorer.address(hook), note: null }]
      : []),
    ...(bic ? [{ label: 'BIC on Etherscan', href: explorer.token(bic), note: null }] : []),
    {
      label: 'Feisty Doge',
      href: `/liquid-assets/${NFD_ASSET_SLUG}`,
      note: 'The token being migrated, in the Bureau’s own records.',
      internal: true,
    },
    {
      label: 'Feisty Doge on DeVamp',
      href: NFD_REVIEW_URL,
      note: 'The authenticity review behind it, and the index this page used to live on.',
    },
  ] as { label: string; href: string | null; note: string | null; internal?: boolean }[]

export default function MigratePage() {
  const hook = config.state === 'configured' ? config.hook : null
  const bic = config.state === 'configured' ? config.bic : null

  return (
    <>
      <section className="section about">
        <Container>
          <div className="about-wrapper">
            <div className="about-top-wrap">
              <h1 className="about-title mig-hero-title" {...rv(300)}>
                Migrate NFD to BIC
              </h1>
            </div>
          </div>
        </Container>
      </section>

      <section className="section migrate">
        <Container>
          <SectionTop label="NFD → BIC" />
          <div className="mig">
            {live && hook && bic ? (
              <MigrationTerminal hook={hook} bic={bic} />
            ) : (
              <>
                <Section tone="notice" role="status">
                  <H2>Not live yet</H2>
                  <p className="mig-p">
                    This site is not set up to run the migration yet, so nothing here will ask your
                    wallet for anything until it is. The contracts are written and tested but are
                    not yet on Ethereum mainnet. When they are, and this page has checked on chain
                    that the addresses it holds are theirs, the wallet controls appear here and
                    nowhere else.
                  </p>
                  <p className="mig-p">
                    Until this page shows a wallet control, no page on this site migrates NFD — and
                    nobody from the Bureau will message you a migration link. A site that asks you
                    to approve a contract for NFD before this page does is not this migration.
                  </p>
                  {config.state === 'invalid' && process.env.NODE_ENV !== 'production' && (
                    <p className="mig-note">
                      {`Configuration problems (development only): ${config.problems.join('; ')}.`}
                    </p>
                  )}
                </Section>

                <Section>
                  <H2>What is coming</H2>
                  <ol className="mig-list numbered">
                    <li>
                      Exact one for one, both directions. No fee, no price impact, no slippage to
                      set.
                    </li>
                    <li>
                      Migrated NFD sits in escrow. Only a reverse migration can release it; there is
                      no admin function that reaches it.
                    </li>
                    <li>
                      The reverse direction cannot be paused. That is enforced by the contract, not
                      by policy.
                    </li>
                    <li>
                      The forward direction can be paused by the community multisig — for example
                      while the Feisty Doge vault is in an auction. This page will say so when it
                      is.
                    </li>
                    <li>
                      Each transaction is capped by what the contract holds right now: BIC inventory
                      going forward, NFD escrow going back. Both numbers will be shown live here,
                      with advice to split anything larger.
                    </li>
                  </ol>
                </Section>

                <Section>
                  <H2>What this page will check before it lets you sign</H2>
                  <p className="mig-p">
                    Before any button here can ask your wallet for anything, the page reads the
                    contracts and confirms all of the following. If one fails, the page says so and
                    stays read-only.
                  </p>
                  <ul className="mig-list bulleted tight">
                    {VERIFICATION_CHECKS.map((c) => (
                      <li key={c.key}>{c.label}</li>
                    ))}
                  </ul>
                </Section>
              </>
            )}

            <details className="mig-more">
              <summary className="mig-more-summary">
                How it works · what can be paused · no external audit
              </summary>

              <Section>
                <H2>What actually happens</H2>
                <ol className="mig-list numbered">
                  <li>
                    <strong>Approve.</strong> The contract may take exactly the amount you typed, no
                    more.
                  </li>
                  <li>
                    <strong>Migrate.</strong> That NFD goes into escrow and the same number of BIC
                    comes back, in one transaction.
                  </li>
                </ol>
                <p className="mig-p">
                  Redeeming is the same two steps reversed. One for one, no fee, nothing to slip.
                  The Bureau never holds your tokens.
                </p>
              </Section>

              <Section>
                <H2>Who controls what</H2>
                <p className="mig-p">
                  The owner is the community multisig,{' '}
                  <Out href={explorer.address(COMMUNITY_MULTISIG)}>
                    <span className="mig-mono">{shortAddress(COMMUNITY_MULTISIG)}</span>
                  </Out>
                  . It can pause <strong>forward</strong> migration and withdraw unused BIC. It
                  cannot pause redeeming, change the rate, or reach the escrow. BIC itself has no
                  owner at all.
                </p>
              </Section>

              <Section>
                <H2>No external audit</H2>
                <p className="mig-p">
                  <strong>There is no external audit, and none is planned.</strong> The vendored
                  Uniswap v4, Solady and OpenZeppelin code is byte-identical to upstream at pinned
                  commits, and there is a test suite and mainnet-fork exercises. What no third party
                  has reviewed is the escrow logic written for this migration — the part that holds
                  tokens. Waiting and watching the contract first is a reasonable thing to do.
                </p>
              </Section>

              <Section>
                <H2>Only the Ethereum mainnet NFD</H2>
                <p className="mig-p">
                  One token: <span className="mig-mono">{NFD_ADDRESS}</span>. The Base and Solana
                  versions of Feisty Doge cannot be migrated here.
                </p>
              </Section>

              <Section tone="notice">
                <H2>Where to read more</H2>
                <ul className="mig-reading">
                  {READING(hook, bic).map((r) => (
                    <li key={r.label}>
                      {r.href === null ? (
                        <span className="mig-label">{r.label}</span>
                      ) : r.internal ? (
                        <A href={r.href} className="mig-link">
                          {r.label} →
                        </A>
                      ) : (
                        <Out href={r.href}>{r.label}</Out>
                      )}
                      {r.note && <span className="mig-note">{r.note}</span>}
                    </li>
                  ))}
                </ul>
                <p className="mig-note">
                  DeVamp is at{' '}
                  <Out href={DEVAMP_URL}>
                    <span className="mig-mono">devamp.it</span>
                  </Out>
                  .
                </p>
              </Section>
            </details>

          </div>
        </Container>
      </section>
    </>
  )
}
