/**
 * Zod-free role constants: safe for a browser bundle that must not pull in zod or the oRPC
 * contract (both are rooted in `@repo/api-contract`'s index, which this module is not part of).
 * `workspace.ts` imports these and re-exports them, so every existing `@repo/api-contract` import
 * keeps working; a client component (like `apps/account`'s `MembersList` and `InviteForm`)
 * imports them from here instead.
 */

export const ROLES = ["viewer", "member", "admin", "owner"] as const
export type Role = (typeof ROLES)[number]
export const ASSIGNABLE_ROLES = ["viewer", "member", "admin"] as const
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number]
/** `role` is at least `min` in the ordered list. */
export const roleAtLeast = (role: Role, min: Role) => ROLES.indexOf(role) >= ROLES.indexOf(min)
