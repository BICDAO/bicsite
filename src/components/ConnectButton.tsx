'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'

// wagmi/viem/WalletConnect load only when the user opens the modal.
const ConnectModal = dynamic(() => import('./ConnectModal'), { ssr: false })

export type SessionUser = { id: number; username?: string | null; email?: string | null }

const display = (u: SessionUser) =>
  u.username?.startsWith('0x') ? `${u.username.slice(0, 6)}…${u.username.slice(-4)}` : (u.username ?? u.email ?? '')

/** Nav item: CONNECT → wallet sign-in; when signed in shows the account + SIGN OUT. */
export function ConnectButton() {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    fetch('/api/users/me', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setUser(d.user ?? null))
      .catch(() => {})
  }, [])

  const signOut = async () => {
    await fetch('/api/users/logout', { method: 'POST', credentials: 'include' })
    setUser(null)
  }

  if (user)
    return (
      <div className="nav-link connect-link">
        {display(user)}{' '}
        <button type="button" className="connect-signout" onClick={signOut}>
          SIGN OUT
        </button>
      </div>
    )

  return (
    <>
      <button type="button" className="nav-link connect-link" onClick={() => setOpen(true)}>
        CONNECT
      </button>
      {open && <ConnectModal onClose={() => setOpen(false)} onSignedIn={setUser} />}
    </>
  )
}
