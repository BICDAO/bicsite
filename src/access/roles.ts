import { Forbidden, type Access, type CollectionBeforeChangeHook, type FieldAccess } from 'payload'

export const ROLES = ['admin', 'editor', 'dev', 'writer', 'user'] as const
export type Role = (typeof ROLES)[number]

const PUBLISHERS: Role[] = ['admin', 'editor', 'dev']
const STAFF: Role[] = [...PUBLISHERS, 'writer']

export const hasRole = (user: unknown, roles: Role[]): boolean => {
  const r = (user as { roles?: unknown } | null | undefined)?.roles
  return Array.isArray(r) && r.some((x) => roles.includes(x))
}

export const isStaff = (user: unknown) => hasRole(user, STAFF)
export const isPublisher = (user: unknown) => hasRole(user, PUBLISHERS)
export const isAdmin = (user: unknown) => hasRole(user, ['admin'])

export const adminOnly: Access = ({ req }) => isAdmin(req.user)
export const adminField: FieldAccess = ({ req }) => isAdmin(req.user)
export const staffOnly: Access = ({ req }) => isStaff(req.user)
export const publishersOnly: Access = ({ req }) => isPublisher(req.user)

/** Drafted content: public sees published only; writers edit, publishers publish/delete. */
export const contentAccess = {
  read: (({ req }) => isStaff(req.user) || { _status: { equals: 'published' } }) as Access,
  create: staffOnly,
  update: staffOnly,
  delete: publishersOnly,
}

export const globalAccess = { read: () => true, update: publishersOnly }

/** Writers may save drafts but never publish. */
export const guardPublish: CollectionBeforeChangeHook = ({ data, req }) => {
  if (data?._status === 'published' && req.user && !isPublisher(req.user)) throw new Forbidden(req.t)
  return data
}
