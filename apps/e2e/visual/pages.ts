import { URLS } from "../e2e.env"

export type VisualPage = {
  app: "www" | "blog"
  path: string
  /** File-name safe, unique: the snapshot is `<name>-<theme>-<width>.png`. */
  name: string
}

/** Every page the global-design-system work must keep looking the same (or change on purpose). */
export const VISUAL_PAGES: VisualPage[] = [
  { app: "www", path: "/", name: "www-home" },
  { app: "www", path: "/book", name: "www-book" },
  { app: "www", path: "/book/inner_start_coaching", name: "www-book-inner-start" },
  { app: "www", path: "/inifran", name: "www-inifran" },
  { app: "www", path: "/inifran/coachning", name: "www-inifran-coachning" },
  { app: "www", path: "/kontakt", name: "www-kontakt" },
  { app: "www", path: "/privacy", name: "www-privacy" },
  { app: "blog", path: "/", name: "blog-home" },
  { app: "blog", path: "/att-leda-genom-en-kris", name: "blog-post" },
  { app: "blog", path: "/en", name: "blog-en" },
]

export const VISUAL_THEMES = ["light", "dark"] as const
export const VISUAL_WIDTHS = [320, 1280] as const

export const visualUrl = (page: VisualPage) => `${URLS[page.app]}${page.path}`
