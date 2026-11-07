# Passkeys: relying party, subdomains and recovery

Passkeys (WebAuthn, discoverable credentials) let a user sign in on `apps/auth`'s `/login` with
their device's fingerprint, face or screen lock instead of a password and a code — a passkey
counts as **both** factors, so `auth.passkey.verify` never returns a two-factor challenge, even
for an account that has two-step verification on. They're added and managed on `apps/account`'s
Security page. See CLAUDE.md's **Passkeys** paragraph for the full behaviour (the challenge, the
counter rule, the per-account cap, impersonation, mail, admin removal); this guide covers the
relying-party setup, local dev, the cap, recovery paths and testing.

## The relying party and why it must be the parent domain

WebAuthn scopes every credential to a **relying party id** (RP ID) — a registrable domain — and a
fixed set of **origins** allowed to use it. A credential registered for one RP ID cannot be used
from another, and an assertion from an origin outside the allowed set is refused.

This matters here because passkeys are added on `account.<domain>` but signed in with on
`auth.<domain>` — two different origins. For one credential to work on both, the RP ID has to be
the domain **both** subdomains are under, not either subdomain itself:

- `PASSKEY_RP_ID` (api env) — unset, it falls back to `SITE_DOMAIN` (normalised the way
  `@repo/sites` reads it: scheme, leading dots and trailing slashes dropped), else
  `brand.localhost` when that is unset too. `SITE_DOMAIN` is the parent domain every app lives
  under, so it is already the right value; set `PASSKEY_RP_ID` only when it is not.
- `PASSKEY_RP_NAME` (api env) — unset, it falls back to `BRAND_NAME`. Only cosmetic: it's the name
  the browser's native passkey prompt shows.
- The **expected origins** are not configurable directly — they're derived from `AUTH_URL` and
  `ACCOUNT_URL` (deduplicated), so they always match whatever those two env vars already say.

A registration or sign-in attempt from any other origin, or against any other RP ID, is refused —
the client never gets a reason more specific than the generic failure message, so a misconfigured
RP ID would look identical to a user cancelling the prompt. That is why the api checks it at boot:
`loadEnv` refuses to start (any `NODE_ENV`, like its other env refusals) when the RP ID is neither
equal to nor a parent domain (by whole labels) of **both** the `AUTH_URL` host and the
`ACCOUNT_URL` host (a single-label RP ID such as `localhost` covers only a host equal to it; the
RP ID is lowercased first), and the error names all three values, e.g.

```
PASSKEY_RP_ID "brand.localhost" must equal, or be a parent domain of, both the AUTH_URL host
(auth.acme.com) and the ACCOUNT_URL host (account.acme.com): set SITE_DOMAIN or PASSKEY_RP_ID
```

The same check runs in the dedicated worker and the backup/restore CLIs, which load the same env.

**What changes in production.** Set `SITE_DOMAIN` on the api to your parent domain (`acme.com`) —
the same value the Next images are built with — next to the real `https://auth.acme.com` /
`https://account.acme.com` `AUTH_URL` / `ACCOUNT_URL`. Leaving it unset no longer fails silently:
the api exits at boot with the message above. `PASSKEY_RP_ID` is needed only when the apps do not
share `SITE_DOMAIN` as their parent.

**Docker Compose.** `docker-compose.yml`'s default stack puts every app on plain `localhost` ports,
which `brand.localhost` does not cover, so its `api` service passes
`PASSKEY_RP_ID: ${PASSKEY_RP_ID:-${SITE_DOMAIN:-localhost}}`: `localhost` (covering the default
`http://localhost:300x` URLs) until the root `.env` sets `SITE_DOMAIN` alongside real `*_URL`
values.

## Local dev: `*.brand.localhost`

In dev, `SITE_DOMAIN` is unset, so `PASSKEY_RP_ID` derives to `brand.localhost` — a valid registrable-domain suffix of both `auth.brand.localhost:3002` and
`account.brand.localhost:3003`. No env var needs to be set for `bun dev` or
`docker-compose.dev.yml` to work.

This relies on the same `*.localhost` secure-context handling CLAUDE.md documents for the `oauth`
cookie: Chromium and Firefox treat any `*.localhost` origin as secure (so WebAuthn, which requires
a secure context, works over plain `http://` in dev), but **Safari does not resolve `*.localhost`
at all** — a passkey built with Safari in this repo's dev setup will not get that far regardless,
the same limitation the OAuth flow already has there. Test passkeys in Chromium or Firefox locally,
or against a real domain over https.

## How sign-in skips the two-step code, and why user verification is required

A password sign-in on a two-step-enabled account answers with a challenge and a trip through
`/login/verify`. A passkey sign-in never does — `auth.passkey.verify` applies everything
`auth.signIn` applies after its password check except the code step, because the ceremony itself
already proved two things a password alone cannot: *possession* of the authenticator and, since
user verification is configured `required` rather than the library's `preferred` default, that a
human was present and verified (a PIN, fingerprint or face) — the two factors a code step would
otherwise add.

This is why **user verification is required, not merely preferred**: a security key with no PIN
set (a bare "insert and tap" device, which only proves possession) is refused outright rather than
silently accepted as a weaker sign-in. If a user's hardware key has no PIN, they'll need to set one
before it can be registered here, or use a platform passkey (their phone or laptop's own
fingerprint/face) instead.

## The per-account cap

An account may hold at most `MAX_PASSKEYS` (10) passkeys. `account.passkeys.registerOptions`
checks the count first — before the current-password or reauth check — so an account already at
the cap spends no password attempt on a request that was always going to be refused
(`CONFLICT` `PASSKEY_LIMIT_MESSAGE`). `account.passkeys.register` re-checks it, race-safe this
time: the count and the insert run inside one transaction that locks the user row first, so two
browser tabs registering a 10th passkey at the same moment serialise on that lock — whichever
commits first is counted by the other, and exactly one gets `CONFLICT`. `apps/account`'s
**Passkeys** card shows a sentence explaining the cap in place of **Add a passkey** once the list
reaches it.

## Recovery paths — losing a passkey never locks anyone out

A passkey is never the *only* door, by design:

- **Password.** An account with a password can always sign in with it, passkey or no passkey.
- **Magic link.** A verified email always works, independent of passkeys entirely.
- **A connected provider.** Google, GitHub or Apple, if linked, signs in the same as before — and
  the reverse holds too: `account.identities.disconnect` keeps at least one way in by refusing to
  remove a passwordless account's last provider *unless* it also holds a passkey, which counts as
  a way in on its own. Disconnecting the last provider and deleting the last passkey at the same
  moment cannot both succeed — both decide under the same user-row lock.
- **Admin removal.** A superadmin can strip every passkey from an account
  (`admin.users.removePasskeys`, `apps/auth`'s `/admin/users/<id>`) when a device is lost and the
  owner can't get back in through any of the above on their own — this ends every session but
  changes nothing else, so the account's password or a fresh magic link still gets them back in.

The one thing the api actively refuses is a **passwordless, provider-less account deleting its
last remaining passkey itself** (`CONFLICT`) — that really would be the only way in, and the api
won't let a user lock themselves out that way. An admin's removal has no such guard: removing
every passkey from such an account doesn't lock it out either, since a magic link to its verified
email still works; it just means the account's next sign-in needs one.

**No session outlives a removal it raced.** An admin's removal and a passkey sign-in landing at
the same moment could otherwise leave a session alive after every one of the account's passkeys
was supposed to be gone: `auth.passkey.verify` records the credential's use and issues its session
in one transaction that locks the user row first, the same order `admin.users.removePasskeys`
takes to delete the rows, void the outstanding challenge and end every session. Whichever commits
first wins outright; the other either finds the passkey already gone (no row to record a use on)
or ends the session the sign-in just created. Postgres gets this from the row lock plus a
read-committed re-read once it is granted; SQLite gets it from its single writer.

## Requiring it for a whole workspace

A workspace owner can go further than recommending two-step verification: `workspaces.security.set`
(`apps/account`'s Workspace page, the **Security** card) can require it of **every** member before
they can open the workspace. A member's own passkey satisfies the requirement exactly as their
account's two-step verification would — either one is enough. This is enforcement, not a feature upsell: it is owner-only but
available on every plan. See CLAUDE.md's **Required two-step.** paragraph and
`apps/api/README.md`'s **Required two-step verification** section for the full mechanism
(the `member(min)` check, the realtime `403`, the chat gate); this is the short version for
whoever is turning it on.

- **Turning it on.** The owner must satisfy the requirement themselves first — the api refuses
  otherwise ("Turn on two-step verification for your own account first."), and the Workspace
  page's **Security** card adds a link to the account's own `/security` page. Checking the box and saving shows a
  confirmation naming how many members would be blocked right away (read fresh, not cached); only
  confirming applies it. A member who is already set up (two-step on, or holds a passkey) is
  unaffected either way.
- **What a blocked member sees.** Every workspace page for that member — `apps/app`'s `/notes` and
  `/chat`, `apps/account`'s `/workspace` and `/payments` — is replaced by a notice explaining what
  is required, with a direct link to set it up, a way to switch to (or create) another workspace,
  and a way to leave this one. They stay a member; nothing is removed or revoked, and nothing they
  already did is undone. Live updates (`LiveNotes`) and chat (`/api/chat`) are blocked the same
  way. Accepting a pending invitation into such a workspace is unaffected — the block applies once
  they are a member, not before.
- **Recovery.** Setting up two-step verification or adding a passkey from the account app's
  `/security` unblocks the member at once — on their *next* request; nothing redirects them back
  automatically, so they reload the page themselves. Losing the device they'd use for either is
  recovered the same way as any other two-step lockout: a recovery code, or a superadmin's
  **Reset two-step verification** — see **Recovery paths** above. Turning the requirement off
  (another owner action) unblocks everyone the next time they load a page.
- **What this does not cover.** No grace period — the block is immediate once the owner confirms.
  It does not require a *phishing-resistant* factor specifically (a plain TOTP app satisfies it,
  same as a passkey); there's no per-session step-up for an already-signed-in member who happens to
  be doing something sensitive. It does not reach a workspace's own API keys or outgoing webhooks —
  those are machine credentials whose creation already needed an admin — nor single sign-on, which
  is out of scope entirely.

## Testing

**`apps/api`'s own tests** drive a software authenticator (`apps/api/src/test-authenticator.ts`):
real WebCrypto P-256 keys, a real `attestationObject` / `authenticatorData` / `clientDataJSON`
with `none` attestation, so the full `@simplewebauthn/server` verification path runs exactly as it
would against a real browser — no mocking of the library itself. This is what exercises the
refusal paths (wrong origin, wrong RP ID, a replayed or wrong-ceremony challenge, a non-increasing
counter) and the policy rules (the last-passkey conflict, impersonation, purge, export) without a
browser anywhere in the loop.

**`apps/e2e`'s journey** (`apps/e2e/tests/passkeys.spec.ts`) drives a real Chromium instance
through Playwright's CDP virtual authenticator (`WebAuthn.enable` +
`WebAuthn.addVirtualAuthenticator`, `protocol: "ctap2"`, resident keys and user verification both
on) — this is the only way to exercise the actual browser-side `@simplewebauthn/browser` calls
(`startRegistration`, `startAuthentication`) end to end. One CDP session, attached once at the top
of the test, stays valid across the auth ↔ account navigations the journey makes (the virtual
authenticator belongs to the page's CDP target, not to an origin).

**The autofill behaviour this journey documents.** `apps/auth`'s `/login` starts a quiet,
conditional-mediation ("autofill") WebAuthn request the moment the page mounts, independent of any
explicit button click — this is what lets a real browser offer a passkey in the email field's
autofill dropdown without the user clicking anything first. With the CDP virtual authenticator's
`automaticPresenceSimulation` left on (the default), that quiet request resolves on its own as
soon as the page loads, with nothing clicked — which is a real, passing scenario
(`passkeys.spec.ts` has a dedicated test for exactly this: a visitor landing on `/login` and ending
up signed in with no interaction at all). To deterministically test the **explicit button** click
instead, the spec has to turn `automaticPresenceSimulation` off before navigating (so the quiet
request stays pending rather than winning the race), click **Sign in with a passkey** (which
aborts the pending quiet request and starts a fresh one), then turn presence simulation back on —
otherwise the quiet, page-load request would resolve and navigate away before the click ever
lands. This is virtual-authenticator behaviour specific to the CDP testing tool, not something a
real user would ever notice (a real security key or platform authenticator has no "automatic
presence" mode to race against).
