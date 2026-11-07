import type { Author } from "@repo/content/schema"
import { BRAND_NAME } from "@repo/sites/brand"

/** Every post's `author` is a key of this record; an unknown key fails the build. */
export const authors: Record<string, Author> = {
  team: {
    name: `${BRAND_NAME} team`,
    bio: "The people building this product.",
    avatar: "/authors/team.svg",
  },
}
