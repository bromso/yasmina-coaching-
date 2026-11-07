import { mkdir, opendir, readFile, rm, stat, writeFile } from "node:fs/promises"
import { dirname, join, relative, resolve, sep } from "node:path"
import { CV_KEY_PATTERN, EXPORT_KEY_PATTERN, FILE_KEY_PATTERN } from "@repo/api-contract"
import { BACKUP_KEY_PATTERN } from "../backup/format"
import { contentTypeForKey, type ListedObject, type Storage } from "./storage"

/** Every file under `dir`, recursively, as absolute paths. A missing directory yields nothing. */
async function* walk(dir: string): AsyncGenerator<string> {
  let entries: Awaited<ReturnType<typeof opendir>>
  try {
    entries = await opendir(dir)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return
    throw error
  }
  for await (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (entry.isFile()) yield full
  }
}

/** Files on disk under `root`. The content type comes from the key's (validated) extension. */
export function localStorage(root: string): Storage {
  const base = resolve(root)
  const pathFor = (key: string) => {
    const path = resolve(join(base, key))
    if (!path.startsWith(base + sep)) throw new Error(`storage key escapes its root: ${key}`)
    return path
  }
  return {
    kind: "local",
    async put(key, bytes) {
      const path = pathFor(key)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, bytes)
    },
    async get(key) {
      try {
        const body = new Uint8Array(await readFile(pathFor(key)))
        return { body, contentType: contentTypeForKey(key), size: body.length }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
        throw error
      }
    },
    async delete(key) {
      await rm(pathFor(key), { force: true })
    },
    async *list(prefix): AsyncGenerator<ListedObject> {
      const dir = resolve(join(base, prefix))
      if (dir !== base && !dir.startsWith(base + sep)) {
        throw new Error(`storage key escapes its root: ${prefix}`)
      }
      for await (const full of walk(dir)) {
        const key = relative(base, full).split(sep).join("/")
        // Never ours; skip rather than report (the sweep must not delete what it cannot trust).
        const ours =
          FILE_KEY_PATTERN.test(key) ||
          EXPORT_KEY_PATTERN.test(key) ||
          CV_KEY_PATTERN.test(key) ||
          BACKUP_KEY_PATTERN.test(key)
        if (!ours) continue
        const info = await stat(full)
        yield { key, lastModified: info.mtime }
      }
    },
  }
}
