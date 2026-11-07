/**
 * Zod-free file-upload constants: safe for a browser bundle that must not pull in zod or the
 * oRPC contract (both are rooted in `@repo/api-contract`'s index, which this module is not part
 * of). `files.ts` imports these and re-exports them, so every existing `@repo/api-contract`
 * import keeps working; a client component (like `apps/account`'s `ImageUploadCard`) imports them
 * from here instead.
 */

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024
export const MAX_IMAGE_DIMENSION = 4096
export const IMAGE_UPLOAD_MESSAGE = "Upload a PNG, JPEG or WebP image up to 2 MB."
export const UPLOAD_RATE_MESSAGE = "Too many uploads, try again later"
/** A file upload whose storage provider failed (`SERVICE_UNAVAILABLE`, 503): worth a retry. */
export const STORAGE_UNAVAILABLE_MESSAGE = "File storage is unavailable, try again later"
export const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp"
