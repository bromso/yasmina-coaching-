/** Up to two initials from the name's words, else the email's first letter. */
export function initialsOf(user: { name: string; email: string }): string {
  const words = user.name.trim().split(/\s+/).filter(Boolean)
  const letters = words.length
    ? words
        .slice(0, 2)
        // Array.from splits by code point, so an astral first letter is not cut in half.
        .map((w) => Array.from(w)[0])
        .join("")
    : (Array.from(user.email)[0] ?? "")
  return letters.toUpperCase()
}
