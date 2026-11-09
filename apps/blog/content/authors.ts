import type { PostLocale } from "@repo/content/posts"
import type { Author } from "@repo/content/schema"

/**
 * Every post's `author` is a key of this record; an unknown key fails the build. Each author's
 * bio exists in both of the blog's languages (`authorsFor(locale)` picks one); the facts are the
 * ones the coaching site states, nothing more.
 */
const AUTHORS: Record<string, Omit<Author, "bio"> & { bio: Record<PostLocale, string> }> = {
  yasmina: {
    name: "Yasmina Petersson",
    bio: {
      sv: "Socionom och Steg 1-psykoterapeut med tjugo år i socialtjänsten, varav åtta som enhetschef. Coachar och mentorar chefer i Varberg och på video, och är certifierad yogalärare (Yoga Alliance, 200 timmar, med 50 timmar yin yoga).",
      en: "Qualified social worker (socionom) and Level 1 psychotherapist with twenty years in social services, eight of them as a unit manager. Coaches and mentors managers in Varberg and by video, and is a certified yoga teacher (Yoga Alliance, 200 hours, with 50 hours of yin yoga).",
    },
    // A 192 px square crop of www's portrait-office photo.
    avatar: "/authors/yasmina.jpg",
  },
}

/** Every author with their bio in `locale`. */
export function authorsFor(locale: PostLocale): Record<string, Author> {
  return Object.fromEntries(
    Object.entries(AUTHORS).map(([key, author]) => [key, { ...author, bio: author.bio[locale] }])
  )
}

/** The authors as the build validates them (the Swedish bios). */
export const authors: Record<string, Author> = authorsFor("sv")
