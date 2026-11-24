export type NexusProfileRole = 'user' | 'admin'

export const NEXUS_ADMIN_EMAIL =
  (typeof process !== 'undefined' && process.env?.NEXUS_ADMIN_EMAIL) || 'admin@nexus.internal'

export const normalizeProfileEmail = (email?: string | null) =>
  String(email || '')
    .trim()
    .toLowerCase()

export const getNexusRoleForEmail = (email?: string | null): NexusProfileRole =>
  normalizeProfileEmail(email) === NEXUS_ADMIN_EMAIL ? 'admin' : 'user'
