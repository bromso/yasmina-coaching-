/**
 * Dependency-free passkey constant: safe for a browser bundle that must not pull in zod or the
 * oRPC contract (both are rooted in `@repo/api-contract`'s index, which this module is not part
 * of). `passkeys.ts` imports this and re-exports it, so every existing `@repo/api-contract`
 * import keeps working; a client component imports it from here instead.
 */

/** The most passkeys one account may hold. Past it `account.passkeys.registerOptions` and
 * `register` answer `CONFLICT` `PASSKEY_LIMIT_MESSAGE`; `register` decides it inside the
 * transaction that inserts, under the user row's lock, so two concurrent registers at
 * `MAX_PASSKEYS - 1` cannot both pass. */
export const MAX_PASSKEYS = 10
