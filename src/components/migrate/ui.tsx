'use client'

import { useState, type ReactNode } from 'react'

import { explorer } from '@/lib/explorer'
import { shortAddress } from '@/lib/format'

/**
 * Small pieces the migration page repeats, in the site's own vocabulary: 1px
 * --black-200 rules, uppercase labels, and prose with the site-wide uppercase
 * turned off. See migrate.css for why that last one is not cosmetic.
 */

export function Panel({
  tone = 'plain',
  role,
  id,
  children,
}: {
  tone?: 'plain' | 'notice'
  role?: 'status' | 'alert'
  id?: string
  children: ReactNode
}) {
  return (
    <section id={id} role={role} className={`mig-panel${tone === 'notice' ? ' notice' : ''}`}>
      {children}
    </section>
  )
}

export function Heading({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="mig-h2">
      {children}
    </h2>
  )
}

export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="mig-link">
      {children} ↗
    </a>
  )
}

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard is unavailable over plain http or without permission.
    }
  }
  return (
    <button type="button" onClick={copy} className="mig-btn">
      <span aria-live="polite">{copied ? 'Copied' : label}</span>
    </button>
  )
}

/** An address in full from 768px up, short below, with copy and Etherscan. */
export function AddressRow({
  label,
  address,
  note,
}: {
  label: string
  address: string
  note?: string
}) {
  return (
    <div className="mig-row">
      <div className="mig-row-head">
        <span className="mig-label">{label}</span>
        {note && <span className="mig-note">{note}</span>}
      </div>
      <span className="mig-row-value mig-mono" title={address}>
        <span className="mig-wide-only">{address}</span>
        <span className="mig-narrow-only">{shortAddress(address)}</span>
      </span>
      <div className="mig-row-actions">
        <CopyButton value={address} />
        <a
          href={explorer.address(address)}
          target="_blank"
          rel="noopener noreferrer"
          className="mig-btn"
        >
          {explorer.name}
        </a>
      </div>
    </div>
  )
}

/** One figure with a label and a helper line. Dashes mean "not read". */
export function Stat({
  label,
  help,
  value,
  title,
  srOnly,
}: {
  label: string
  help: string
  value: ReactNode
  title?: string
  srOnly?: string
}) {
  return (
    <div className="mig-stat">
      <span className="mig-stat-label">{label}</span>
      <span className="mig-stat-value" title={title}>
        {value}
        {srOnly && <span className="mig-sr">{srOnly}</span>}
      </span>
      <span className="mig-stat-help">{help}</span>
    </div>
  )
}
