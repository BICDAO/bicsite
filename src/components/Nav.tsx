'use client'

import Link from 'next/link'
import { useState } from 'react'

import type { Site } from '@/payload-types'

import { ConnectButton } from './ConnectButton'

export function Nav({ nav }: { nav: Site['nav'] }) {
  const [open, setOpen] = useState(false)
  const cta = nav?.cta

  return (
    <div className="navbar w-nav" data-collapse="medium">
      <div className="container w-container">
        <div className="navbar-wrapper">
          <Link href="/" className="brand-logo-link w-nav-brand">
            <img src="/brand/bic-type.svg" alt="" className="brand-logo-image" />
            <div className="header-name">Bureau of Internet Culture</div>
          </Link>
          <div className="nav-wrap">
            <div className="nav-menu-wrapper">
              <nav className="nav-menu w-nav-menu" data-nav-menu-open={open ? '' : undefined} onClick={() => setOpen(false)}>
                <div className="nav-all-menu-wrap">
                  {cta?.href && (
                    <a href={cta.href} target="_blank" className="nav-link">
                      {cta.label}
                    </a>
                  )}
                  <ConnectButton />
                  <div className="social-icons-navbar-container">
                    {nav?.socials?.map((s, i) => (
                      <a
                        key={s.id}
                        href={s.href}
                        target="_blank"
                        className={`social-icon-navbar w-inline-block${i === 0 ? ' left' : ''}${s.platform === 'dexscreener' ? ' dex' : ''}`}
                      >
                        <img src={`/icons/${s.platform}.svg`} alt={s.platform} className="image" />
                      </a>
                    ))}
                  </div>
                </div>
              </nav>
            </div>
            <button
              type="button"
              className="menu-button w-nav-button"
              aria-label="Menu"
              aria-expanded={open}
              onClick={() => setOpen(!open)}
            >
              <div className="hamburger" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
