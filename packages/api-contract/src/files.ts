import { z } from "zod"
import {
  IMAGE_ACCEPT,
  IMAGE_UPLOAD_MESSAGE,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION,
  STORAGE_UNAVAILABLE_MESSAGE,
  UPLOAD_RATE_MESSAGE,
} from "./files-limits"

export {
  IMAGE_ACCEPT,
  IMAGE_UPLOAD_MESSAGE,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION,
  STORAGE_UNAVAILABLE_MESSAGE,
  UPLOAD_RATE_MESSAGE,
}

export const FILE_KEY_PATTERN = /^(avatars|logos)\/[1-9]\d*\/[A-Za-z0-9_-]{22}\.(png|jpg|webp)$/
export const FileKeySchema = z.string().max(200).regex(FILE_KEY_PATTERN)
/**
 * A data export's storage key (`exports/<userId>/<random>.json`). Kept apart from
 * `FILE_KEY_PATTERN` on purpose: `files.get` never serves an export — only
 * `account.export.download` does, to its owner.
 */
export const EXPORT_KEY_PATTERN = /^exports\/[1-9]\d*\/[A-Za-z0-9_-]{22}\.json$/

/** `account.avatar.set`'s input; `WorkspaceImageUploadSchema` (workspace.ts) is the logo's. */
export const ImageUploadSchema = z.object({ file: z.file() })
export const AvatarResultSchema = z.object({ avatarUrl: z.string() })
export const LogoResultSchema = z.object({ logoUrl: z.string() })

/**
 * `z.file()` carries no size limit on purpose: the api checks size itself and answers this
 * declared message, where a schema `max` would answer an undeclared validation error instead.
 */
export const ImageUploadErrors = {
  BAD_REQUEST: { message: IMAGE_UPLOAD_MESSAGE },
  TOO_MANY_REQUESTS: { message: UPLOAD_RATE_MESSAGE },
  SERVICE_UNAVAILABLE: { message: STORAGE_UNAVAILABLE_MESSAGE },
} as const
