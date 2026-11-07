# File storage

`apps/api` keeps user files — a profile photo per user and a logo per workspace — behind one seam,
`apps/api/src/storage/`, picked at boot by `STORAGE_PROVIDER`. Uploads go through our own servers:
the form posts to a server action in `apps/account`, the action hands the file to the api, and the
api validates it, strips its metadata and writes it to storage. Browsers never talk to the bucket
and never call the api: each signed-in app (`app`, `auth`, `account`) serves images from its own
`/files/<key>` route, which fetches them from the api with the service token. The how and why are in
CLAUDE.md (**Storage**) and `apps/api/README.md` (**Storage**); this guide is about picking and
setting up a provider.

## Where the values go

| Running | File |
|---|---|
| `bun dev` / `bun --filter @repo/api dev` | `apps/api/.env` (copy `apps/api/.env.example`) |
| `docker compose up` | nothing to set: `docker-compose.yml` points the api at its own SeaweedFS (see [SeaweedFS in Compose](#seaweedfs-in-compose)); the root `.env` (copy `.env.example`) may override `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` |
| Production | the api service's environment |

Only the api reads these. The Next apps need nothing new: the `/files` route uses the `API_URL` and
`API_SERVICE_TOKEN` they already have.

## Choosing a provider

| `STORAGE_PROVIDER` | Use it for | Notes |
|---|---|---|
| `local` (default) | development, tests, a single api instance with a persistent volume | Files on disk under `STORAGE_DIR` (default `.data/storage`, relative to the api's working directory). Keyless. With `NODE_ENV=production` the api logs a warning at startup. Lost with the container unless the directory is a volume; with more than one api replica each keeps its own files, so an image is found only by the replica that stored it |
| `s3` | production | Any S3-compatible bucket through Bun's built-in `S3Client` (no AWS SDK): AWS S3, Cloudflare R2, MinIO, SeaweedFS, and others that speak the S3 API. Needs `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` — the api exits at startup naming any that are missing; `S3_ENDPOINT` is optional (empty → AWS S3) |

The Docker image (`docker/bun-service.Dockerfile`) sets `STORAGE_DIR=/data/storage`: `/data` is
writable by the `bun` user the api runs as, while the working directory `/app` is not. If you stay
on `local` there, mount a volume on `/data` (the same volume that holds a SQLite database), or the
files go with the container.

The api only ever calls `PutObject`, `GetObject` (one request — no existence check first) and
`DeleteObject`, on keys of the form `avatars/<userId>/<random>.<ext>` and
`logos/<workspaceId>/<random>.<ext>`, plus `ListObjectsV2` under `avatars/` and `logos/` for the
nightly `storage.sweep` job. It never creates the bucket, never sets an ACL and never needs CORS.
A missing key's `GetObject` answers `NoSuchKey`, which `get` reads as `null` — a 404 from every
image route, the same as `local`'s missing-file case. A 403 (`AccessDenied`) reads the same way
(see the IAM policy note below for when that happens), but is also reported every time through
`onForbidden`, since a 403 is a configuration problem rather than a routine missing file.

> **One bucket per environment.** `storage.sweep` deletes every object under `avatars/` and `logos/`
> that *its own* database does not reference, older than 24 h. Point two environments at one bucket —
> staging and production, or a local `bun --filter @repo/api dev:worker` with the production
> credentials — and each one's nightly sweep deletes the other's avatars and logos. Keys carry no
> environment prefix, so a prefix-scoped credential does not separate them: give every environment
> its own bucket (and its own credentials, so a misconfigured one cannot reach another's).
Deletes of replaced or removed images are `storage.delete` jobs, retried with backoff for 5
attempts, then dead (visible on `/admin`).

## AWS S3

1. **S3 → Create bucket.** Pick a region; leave **Block all public access** on (the api reads
   objects with its own credentials, nobody else needs to). Versioning and default encryption are up
   to you.
2. **IAM → Users → Create user** (no console access), then attach an inline policy scoped to that
   bucket: the three object actions, and `s3:ListBucket` for the nightly sweep:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
         "Resource": "arn:aws:s3:::<bucket>/*"
       },
       {
         "Effect": "Allow",
         "Action": "s3:ListBucket",
         "Resource": "arn:aws:s3:::<bucket>",
         "Condition": { "StringLike": { "s3:prefix": ["avatars/*", "logos/*"] } }
       }
     ]
   }
   ```

   Requests only ever touch keys a database row points at, but the `storage.sweep` job (daily,
   03:30 UTC; see [background-jobs.md](background-jobs.md)) lists `avatars/` and `logos/` to delete
   objects no row references and older than 24 h — what a crash between the upload and the commit
   would otherwise leave behind. Without `s3:ListBucket` the sweep fails, retries and ends as a dead
   job on `/admin` every night; uploads keep working, but a missing key's `GetObject` now answers
   403 instead of 404 too — still a 404 to the browser, since `get` treats a 403 as "not found",
   but logged and recorded as a telemetry `server` row on every such request (`onForbidden`), so a
   bucket missing this permission is visible there even though nothing user-facing breaks.
3. **Security credentials → Create access key** (application running outside AWS), then set on the
   api:

   ```
   STORAGE_PROVIDER=s3
   S3_BUCKET=<bucket>
   S3_REGION=<region, e.g. eu-north-1>
   S3_ACCESS_KEY_ID=<access key id>
   S3_SECRET_ACCESS_KEY=<secret access key>
   ```

   Leave `S3_ENDPOINT` empty. On AWS compute (ECS, EC2) you may prefer a task or instance role, but
   the api reads only these variables, so it still needs a key pair.

## Cloudflare R2

1. **R2 → Create bucket.** Keep it private unless you also serve from it publicly (see
   [Public bucket or CDN](#public-bucket-or-cdn)).
2. **R2 → Manage API tokens → Create API token** with **Object Read & Write**, limited to that
   bucket. Copy the access key id and secret access key it shows (the S3-compatible pair, not the
   token value).
3. Set on the api:

   ```
   STORAGE_PROVIDER=s3
   S3_ENDPOINT=https://<account id>.r2.cloudflarestorage.com
   S3_REGION=auto
   S3_BUCKET=<bucket>
   S3_ACCESS_KEY_ID=<access key id>
   S3_SECRET_ACCESS_KEY=<secret access key>
   ```

## SeaweedFS in Compose

`docker compose up` runs [SeaweedFS](https://github.com/seaweedfs/seaweedfs) next to the api:
`seaweedfs` (one `weed server` process — master, volume server, filer and S3 gateway — with the S3
API published on the host's loopback only, `127.0.0.1:8333`) and a one-shot
`seaweedfs-init` that creates the `uploads` bucket unless it exists, then exits; the api waits for
it, then runs with `STORAGE_PROVIDER=s3`, `S3_ENDPOINT=http://seaweedfs:8333`, `S3_BUCKET=uploads`
and `S3_REGION=us-east-1`. The gateway is configured (`-s3.config`, from the `seaweedfs-s3` config in
`docker-compose.yml`) with one identity whose key pair is `S3_ACCESS_KEY_ID` /
`S3_SECRET_ACCESS_KEY` from the root `.env` — the same pair the api signs with (default
`devstorage` / `devstorage-secret`, so change both before exposing the stack). An unsigned request
or a wrong key is refused (`403`); without that identity SeaweedFS's gateway would accept anything.
The filer (port 8888 inside the container) is not behind those keys — it can read, write and
delete any object — so Compose never publishes it; inspect the store with
`docker compose exec seaweedfs weed shell`.
Objects live in the `seaweedfs-data` volume. The image is pinned to a release tag
(`chrislusf/seaweedfs:4.48`). `docker-compose.dev.yml` runs no SeaweedFS; the api there stays on
`local`.

To point a locally running api (`bun --filter @repo/api dev`) at the Compose SeaweedFS instead, set
`STORAGE_PROVIDER=s3`, `S3_ENDPOINT=http://localhost:8333`, `S3_BUCKET=uploads`,
`S3_REGION=us-east-1` and the two keys in `apps/api/.env`.

A self-hosted MinIO or SeaweedFS in production works the same way: create a bucket and a user whose
policy allows the actions above (the three object actions on `arn:aws:s3:::<bucket>/*`, listing on
the bucket), and set `S3_ENDPOINT` to its URL.

To run the storage contract tests against a real endpoint as well, with the Compose SeaweedFS up:
`cd apps/api && S3_TEST_ENDPOINT=http://localhost:8333 bun test src/storage` (optional
`S3_TEST_BUCKET`, default `uploads`, which must exist; `S3_TEST_REGION`, `S3_TEST_ACCESS_KEY_ID`,
`S3_TEST_SECRET_ACCESS_KEY`, the Compose defaults otherwise). CI does not run it.

## Public bucket or CDN

By default every image URL is `/files/<key>` on the app showing it, and the request goes browser →
Next app → api → storage. Set `STORAGE_PUBLIC_URL` to serve images straight from a public bucket or
a CDN instead:

```
STORAGE_PUBLIC_URL=https://files.acme.com
```

The api then builds every `avatarUrl` / `logoUrl` as `${STORAGE_PUBLIC_URL}/<key>` (a trailing
slash is dropped) and the `/files` routes go unused. Uploads still go through the api. For example:
an R2 bucket with a custom domain connected (or its `r2.dev` URL), or a CloudFront distribution in
front of an S3 bucket.

What changes:

- **Removed images linger.** Behind the `/files` route, `files.get` serves only a key a row
  currently points at, so a replaced or removed image stops being served at once. From a public
  bucket, the old object is still deleted when the image is replaced or removed, but a CDN keeps
  its copy until it expires. Purge the CDN if that matters.
- **Headers are the bucket's.** The `/files` route adds `X-Content-Type-Options: nosniff`,
  `Content-Disposition: inline`, `Content-Security-Policy: sandbox; default-src 'none'` and a
  one-year immutable `Cache-Control`. A bucket serves the stored `Content-Type` (always PNG, JPEG or
  WebP, set by the api from the validated bytes); add the rest as CDN response headers if you want
  them.
- **HTTPS only.** The apps' shared Content-Security-Policy allows `img-src` from `https:`, so
  `STORAGE_PUBLIC_URL` must be an `https://` URL: with `NODE_ENV=production` the api exits at
  startup on any other scheme, except for a host ending in `.localhost` (a local production-mode
  stack). Outside production `http://` is accepted.
- **The key is the capability**, as before: unguessable (128 random bits), but anyone holding a URL
  can fetch it. Avatars and logos are meant to be seen; do not store anything private this way.

## Why no bucket CORS

Browsers never send a request to the bucket. Uploads are a form post to `apps/account`, which hands
the file to the api server to server; images are loaded with a plain `<img>`, which needs no CORS
whether it comes from the app's own `/files` route or from `STORAGE_PUBLIC_URL`. There are no
presigned URLs and no direct-to-bucket uploads, so there is no CORS policy to configure.

## Backups

The bucket is the backup boundary: turn on versioning, replication or lifecycle rules there as you
would for any other data. The database stores only the keys (`users.avatar_key`,
`workspaces.logo_key`), so a database restore without the matching objects leaves images that fail to
load, and a bucket restore without the database leaves objects nothing points at (they
are never served, see above). With `local`, back up `STORAGE_DIR` together with the database.
