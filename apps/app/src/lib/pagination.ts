/**
 * `?cursor=` from the URL: a positive safe integer, or undefined (the first page) for anything else.
 */
export function parseCursor(value: string | string[] | undefined): number | undefined {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return undefined
  const cursor = Number(value)
  return Number.isSafeInteger(cursor) && cursor > 0 ? cursor : undefined
}
