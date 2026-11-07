/** Digits and hex runs become `#`, so "Note 42" and "Note 43" are one group. */
export const normaliseMessage = (message: string) =>
  message.replace(/0x[0-9a-f]+|[0-9a-f]{8,}(?:-[0-9a-f]{4,})*|\d+/gi, "#")

/** The first `at …` frame, without `?query` and `:line:col`, or "" when there is none. */
export function firstFrame(stack: string | undefined): string {
  const line = stack?.split("\n").find((l) => /^\s*at\s/.test(l))
  if (!line) return ""
  return line
    .trim()
    .replace(/^at\s+/, "")
    .replace(/\?[^):\s]*/g, "")
    .replace(/:\d+:\d+(?=\)?$)/, "")
}

/**
 * `app|kind|[digest|]message|frame`, message and frame normalised. A digest (Next's id for a
 * server-component error whose production message is generic) is the error's real identity, so
 * it joins the key when present; the frame is normalised so a content-hashed chunk name
 * (`app-8f3c2a9b.js`) does not start a new group on every deploy.
 */
export function fingerprint(
  app: string,
  kind: string,
  message: string,
  stack?: string,
  digest?: string
): string {
  const parts = [normaliseMessage(message), normaliseMessage(firstFrame(stack))]
  const key = [app, kind, ...(digest ? [digest] : []), ...parts].join("|")
  return new Bun.CryptoHasher("sha256").update(key).digest("hex")
}
