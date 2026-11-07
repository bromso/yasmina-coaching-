# Setting up Google, GitHub and Apple sign-in

Social sign-in is off until you configure it. Each provider is a group of `OAUTH_*` variables
read by `apps/api` (`src/env.ts`): set **all** of a provider's variables and its button appears on
`/login` and `/signup` (and its **Connect** row in `account.`'s Security page); set none and it is
simply absent; set some but not all and the api refuses to start, naming what is missing.

The secrets live only in `apps/api`. The Next apps never see them: `apps/auth` asks the api for the
authorization URL (`auth.oauth.start`) and hands the provider's `code` back to it
(`auth.oauth.callback`), which does the token exchange.

## Where the values go

| Running | File |
|---|---|
| `bun dev` / `bun --filter @repo/api dev` | `apps/api/.env` (copy `apps/api/.env.example`) |
| `docker compose up` | the root `.env` (copy `.env.example`); `docker-compose.yml` passes the eight `OAUTH_*` vars to `api` |
| Production | the api service's environment |

## The redirect URI

The api builds every redirect URI from its own `AUTH_URL`:

```
${AUTH_URL}/oauth/<provider>/callback      # <provider> is google, github or apple
```

| Environment | Redirect URI to register |
|---|---|
| `bun dev` | `http://auth.brand.localhost:3002/oauth/<provider>/callback` |
| `docker compose up` (default `AUTH_URL`) | `http://localhost:3002/oauth/<provider>/callback` — or set `AUTH_URL` in the root `.env` and register that |
| Production | `https://auth.<your-domain>/oauth/<provider>/callback` |

The URI the provider has on file must match the api's `AUTH_URL` exactly (scheme, host, port,
path); a mismatch fails at the provider with a `redirect_uri` error before the user ever returns.

## Google

1. [Google Cloud Console](https://console.cloud.google.com/) → pick or create a project.
2. **APIs & Services → OAuth consent screen** (Google Auth Platform): app name, support email,
   audience **External**. While the app is in *Testing*, only the test users you list can sign in;
   publish it for everyone.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**, application type
   **Web application**.
4. **Authorized redirect URIs**: add the URI for each environment you use (see above). Google
   requires `https` except for localhost hosts; if the console refuses the
   `http://auth.brand.localhost:3002/…` URI, use a separate client with an https tunnel for local
   testing.
5. Copy the values:

   | Console | Env var |
   |---|---|
   | Client ID | `OAUTH_GOOGLE_CLIENT_ID` |
   | Client secret | `OAUTH_GOOGLE_CLIENT_SECRET` |

Scopes requested: `openid email profile`, with PKCE. The api reads the id token's `sub`, `email`,
`email_verified` and `name`.

## GitHub

1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App** (or the same under an
   organisation's settings). An OAuth App, not a GitHub App.
2. **Homepage URL**: your site. **Authorization callback URL**: the GitHub redirect URI (see
   above). An OAuth App holds one callback URL, so register one app per environment (dev, prod).
3. **Generate a new client secret** — it is shown once.
4. Copy the values:

   | GitHub | Env var |
   |---|---|
   | Client ID | `OAUTH_GITHUB_CLIENT_ID` |
   | Client secret | `OAUTH_GITHUB_CLIENT_SECRET` |

Scopes requested: `read:user user:email`. GitHub does not put a verified email in the profile, so
the api calls `/user/emails` and uses only the **primary, verified** address; an account without
one cannot sign up or link by email (the user sees "email is not verified", and can still sign in
another way and connect GitHub from `account.`).

## Apple

Needs a paid Apple Developer Program membership.

1. [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/) →
   **Identifiers**: an **App ID** with the **Sign in with Apple** capability enabled (the primary
   App ID the Services ID and key group under).
2. **Identifiers → + → Services IDs**: register one (e.g. `com.yourbrand.auth`). Open it, tick
   **Sign in with Apple → Configure**: primary App ID from step 1; **Domains and Subdomains**
   `auth.<your-domain>`; **Return URLs** `https://auth.<your-domain>/oauth/apple/callback`.
3. **Keys → +**: enable **Sign in with Apple**, configure it with the same primary App ID, register,
   and **download the `.p8` file** — Apple offers it once. Note the **Key ID**.
4. Your **Team ID** is in the top-right of the developer portal (and under Membership).
5. Copy the values:

   | Apple | Env var |
   |---|---|
   | Services ID identifier (`com.yourbrand.auth`) — not the App ID | `OAUTH_APPLE_CLIENT_ID` |
   | Team ID | `OAUTH_APPLE_TEAM_ID` |
   | Key ID | `OAUTH_APPLE_KEY_ID` |
   | Contents of `AuthKey_<KEYID>.p8` | `OAUTH_APPLE_PRIVATE_KEY` |

   The `.p8` is a multi-line PKCS#8 PEM (`-----BEGIN PRIVATE KEY-----`). Put it on one line with <!-- gitleaks:allow -->
   literal `\n` escapes, which the api turns back into newlines:

   ```bash
   awk 'NF { sub(/\r/, ""); printf "%s\\n", $0 }' AuthKey_ABC123DEF4.p8
   # OAUTH_APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIGT…\n-----END PRIVATE KEY-----\n"
   ```

   The key is parsed at boot: a value that is not a PKCS#8 PEM stops the api with
   `OAUTH_APPLE_PRIVATE_KEY is not a PKCS#8 PEM` (the value itself is never logged).

Scopes requested: `name email`, which makes Apple return with `response_mode=form_post` — a
cross-site `POST` to the callback, the reason the `oauth` state cookie is `SameSite=None` (see
`apps/auth/README.md`). Apple's client secret is a short-lived ES256 JWT that Arctic signs from the
key on every exchange, so there is no six-month secret to rotate.

Apple-specific behaviour:

- **The name arrives once**, on the user's first consent; later sign-ins carry only the id token.
- **Hide My Email**: the user may share a `@privaterelay.appleid.com` address. It is verified, so it
  creates (or matches) an account with that relay address, not the user's real email. To mail
  relay addresses (magic links, password notices), register your sending domain under
  **Sign in with Apple for Email Communication** in the developer portal.
- **https only**: Apple accepts no `http` or `localhost` Return URLs, so Apple sign-in cannot be
  exercised on `brand.localhost`. Test it on a deployed environment, or behind an https tunnel
  that serves the whole stack under one parent domain (with `COOKIE_DOMAIN`, `AUTH_URL` and
  `APP_URL` set to it, so the session cookie still reaches the other apps).

## Local testing notes

- **Use Chrome (or another Chromium browser) or Firefox.** The `oauth` state cookie is `Secure`;
  both treat `http://*.localhost` as a secure context and store it over plain http. Safari does not
  resolve `*.localhost` at all, so the `brand.localhost` dev hosts do not load there.
- **Restart the api after editing its `.env`** — the provider list is built at startup, and the
  auth pages ask `auth.providers()` on each request, so the buttons follow the api (an api that
  cannot answer hides them).
- **Linking**: signing in with a provider whose verified email matches an existing account links
  to it. If that account's email was never verified, it is treated as possibly squatted: its
  password, sessions and connected identities are cleared before linking (see `apps/api/README.md`,
  **Social sign-in and magic link**). The real owner sets a new password from `account.`.
- **A failed round trip** lands on `/login?error=<code>&provider=<id>` with a message: `state`
  (cookie missing or expired, or the attempt started elsewhere), `cancelled`, `unverified`,
  `claimed`, `provider` (unreachable) or `failed`. The api's log names the provider and its OAuth
  error code, never the code, verifier or tokens.
