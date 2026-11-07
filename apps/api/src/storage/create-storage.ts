import { localStorage } from "./local"
import { s3Storage } from "./s3"
import type { Storage } from "./storage"

export type StorageEnv = {
  STORAGE_PROVIDER: "local" | "s3"
  STORAGE_DIR: string
  S3_BUCKET?: string
  S3_REGION?: string
  S3_ENDPOINT?: string
  S3_ACCESS_KEY_ID?: string
  S3_SECRET_ACCESS_KEY?: string
}

/** Picks the provider from env; loadEnv has already refused a half-configured s3. */
export function createStorage(
  env: StorageEnv,
  opts?: { onForbidden?: (key: string, error: unknown) => void }
): Storage {
  if (env.STORAGE_PROVIDER !== "s3") return localStorage(env.STORAGE_DIR)
  return s3Storage({
    bucket: env.S3_BUCKET as string,
    region: env.S3_REGION as string,
    endpoint: env.S3_ENDPOINT,
    accessKeyId: env.S3_ACCESS_KEY_ID as string,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY as string,
    onForbidden: opts?.onForbidden,
  })
}
