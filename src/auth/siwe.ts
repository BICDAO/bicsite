import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

import { APIError, getFieldsToSign, jwtSign, type Endpoint, type PayloadRequest } from 'payload'
import { addSessionToUser, generatePayloadCookie, parseCookies } from 'payload/shared'
import { createPublicClient, http, type Hex } from 'viem'
import { generateSiweNonce, parseSiweMessage, verifySiweMessage } from 'viem/siwe'

import { chains } from '@/lib/chains'

/**
 * Sign-In With Ethereum → native Payload session (same cookie/sessions as email login).
 *   GET  /api/users/siwe/nonce   → { nonce } + signed httpOnly nonce cookie
 *   POST /api/users/siwe/verify  { message, signature } → sets payload-token cookie
 */

const NONCE_COOKIE = 'bic-siwe-nonce'
const TTL = 600 // seconds a nonce / signed message stays valid

const hmac = (value: string, secret: string) => createHmac('sha256', secret).update(value).digest('base64url')

const nonceCookie = (value: string, maxAge: number) =>
  `${NONCE_COOKIE}=${value}; Path=/api/users/siwe; HttpOnly; SameSite=Lax; Max-Age=${maxAge}` +
  (process.env.NODE_ENV === 'production' ? '; Secure' : '')

/** Cookie = nonce.expiry.hmac (stateless; tamper-proof via PAYLOAD_SECRET). */
const readNonce = (req: PayloadRequest) => {
  const [nonce, exp, sig] = (parseCookies(req.headers).get(NONCE_COOKIE) ?? '').split('.')
  if (!nonce || !exp || !sig) return null
  const expected = Buffer.from(hmac(`${nonce}.${exp}`, req.payload.secret))
  const actual = Buffer.from(sig)
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null
  return Number(exp) > Date.now() / 1000 ? nonce : null
}

const nonce: Endpoint = {
  path: '/siwe/nonce',
  method: 'get',
  handler: async (req) => {
    const value = generateSiweNonce()
    const exp = Math.floor(Date.now() / 1000) + TTL
    return Response.json(
      { nonce: value },
      { headers: { 'Set-Cookie': nonceCookie(`${value}.${exp}.${hmac(`${value}.${exp}`, req.payload.secret)}`, TTL) } },
    )
  },
}

const verify: Endpoint = {
  path: '/siwe/verify',
  method: 'post',
  handler: async (req) => {
    const body = (await req.json?.().catch(() => null)) as { message?: unknown; signature?: unknown } | null
    const message = typeof body?.message === 'string' ? body.message : ''
    const signature = typeof body?.signature === 'string' ? (body.signature as Hex) : undefined
    const expectedNonce = readNonce(req)
    const fields = message ? parseSiweMessage(message) : {}
    const chain = chains.find((c) => c.id === fields.chainId)
    const issuedAt = fields.issuedAt?.getTime() ?? 0

    if (!signature || !expectedNonce || !chain || !fields.address || Date.now() - issuedAt > TTL * 1000) {
      throw new APIError('Invalid sign-in request', 400)
    }

    // Checks signature (EOA, ERC-1271, ERC-6492), domain, nonce, and expiry/notBefore.
    const valid = await verifySiweMessage(createPublicClient({ chain, transport: http() }), {
      message,
      signature,
      domain: req.headers.get('host') ?? '',
      nonce: expectedNonce,
    })
    if (!valid) throw new APIError('Invalid signature', 401)

    const { payload } = req
    const address = fields.address.toLowerCase()
    const wallet = (await payload.find({ collection: 'wallets', where: { address: { equals: address } }, depth: 0, limit: 1, req }))
      .docs[0]

    // Replay guard: each sign-in must be newer than the wallet's last one.
    if (wallet?.lastSignIn && new Date(wallet.lastSignIn).getTime() >= issuedAt) {
      throw new APIError('Sign-in message already used', 401)
    }

    // Known wallet → its user. Unknown wallet → link to the signed-in account, else a new wallet-only user.
    let userId = wallet ? (wallet.user as number) : (req.user?.id as number | undefined)
    if (wallet && req.user && req.user.id !== userId) throw new APIError('Wallet is linked to another account', 409)
    if (!userId) {
      // Payload only offers "create first user" (admin bootstrap) while users is empty — keep it that way.
      if (!(await payload.count({ collection: 'users', req })).totalDocs) {
        throw new APIError('Site not initialized: create the admin account first', 503)
      }
      const created = await payload.create({
        collection: 'users',
        data: { username: address, password: randomBytes(32).toString('hex'), roles: ['user'] },
        context: { siwe: true },
        req,
      })
      userId = created.id
    }

    const lastSignIn = new Date(issuedAt).toISOString()
    if (wallet) await payload.update({ collection: 'wallets', id: wallet.id, data: { lastSignIn }, req })
    else await payload.create({ collection: 'wallets', data: { address, user: userId, lastSignIn }, req })

    // Same steps as Payload's login operation: add session, sign JWT, set auth cookie.
    const collectionConfig = payload.collections.users.config
    const user = await payload.db.findOne<Record<string, unknown> & { id: number; email?: string; username?: string }>({
      collection: 'users',
      where: { id: { equals: userId } },
      req,
    })
    if (!user) throw new APIError('User not found', 500)
    user.collection = 'users'
    const { sid } = await addSessionToUser({ collectionConfig, payload, req, user: user as never })
    const { token } = await jwtSign({
      fieldsToSign: getFieldsToSign({ collectionConfig, email: user.email ?? '', sid, user: user as never }),
      secret: payload.secret,
      tokenExpiration: collectionConfig.auth.tokenExpiration,
    })

    const headers = new Headers()
    headers.append(
      'Set-Cookie',
      generatePayloadCookie({ collectionAuthConfig: collectionConfig.auth, cookiePrefix: payload.config.cookiePrefix, token }),
    )
    headers.append('Set-Cookie', nonceCookie('', 0))
    return Response.json({ user: { id: user.id, username: user.username } }, { headers })
  },
}

export const siweEndpoints = [nonce, verify]
