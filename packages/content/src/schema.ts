import { z } from "zod"

/** Lowercase kebab-case: one or more hyphen-separated groups of lowercase letters and digits. */
export const TAG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const SLUG_PATTERN = TAG_PATTERN

/** The languages a post can be written in. */
export const POST_LOCALES = ["sv", "en"] as const
export type PostLocale = (typeof POST_LOCALES)[number]

export interface Author {
  name: string
  bio: string
  avatar: string
  links?: { label: string; href: string }[]
}

const coverSchema = z.strictObject({
  src: z.string().min(1),
  alt: z.string().min(1),
})

/**
 * `z.coerce.date()` also accepts `null` (an empty YAML `date:`), numbers and booleans — too
 * permissive for frontmatter. Accept only a `Date` or a non-empty string that parses to a valid
 * date.
 */
export const dateSchema = z
  .union([z.date(), z.string().min(1)])
  .transform((value) => new Date(value))
  .refine((date) => !Number.isNaN(date.getTime()), { message: "Invalid date" })

const postFrontmatterShape = {
  title: z.string().min(1),
  description: z.string().min(1),
  date: dateSchema,
  updated: dateSchema.optional(),
  author: z.string().min(1),
  tags: z.array(z.string()).default([]),
  cover: coverSchema.optional(),
  draft: z.boolean().optional(),
  type: z.string().min(1).default("Blog Post"),
  /** The post's language. Optional, defaulting to English, so a blog in one language never sets it. */
  locale: z.enum(POST_LOCALES).default("en"),
  /** The slug of the post this one translates (the original, in another language). */
  translationOf: z.string().regex(SLUG_PATTERN, "must be a post's slug").optional(),
}

/** Strict: an unknown key refuses the document. Used to validate a post before it is trusted. */
export const postFrontmatterSchema = z.strictObject(postFrontmatterShape)

export type PostFrontmatter = z.infer<typeof postFrontmatterSchema>

const docFrontmatterShape = {
  title: z.string().min(1),
  description: z.string().min(1),
  icon: z.string().min(1).optional(),
  updated: dateSchema.optional(),
  tags: z.array(z.string().regex(TAG_PATTERN, "must be lowercase kebab-case")).default([]),
  type: z.string().min(1).default("Documentation"),
}

/** Strict: an unknown key refuses the document. Used to validate a docs page before it is trusted. */
export const docFrontmatterSchema = z.strictObject(docFrontmatterShape)

export type DocFrontmatter = z.infer<typeof docFrontmatterSchema>

const helpFrontmatterShape = {
  title: z.string().min(1),
  description: z.string().min(1),
  updated: dateSchema.optional(),
  tags: z.array(z.string().regex(TAG_PATTERN, "must be lowercase kebab-case")).default([]),
  popular: z.boolean().optional(),
  type: z.string().min(1).default("Help Article"),
}

/** Strict: an unknown key refuses the document. Used to validate a help article before it is
 * trusted. */
export const helpFrontmatterSchema = z.strictObject(helpFrontmatterShape)

export type HelpFrontmatter = z.infer<typeof helpFrontmatterSchema>

/**
 * `dateSchema`, narrowed to a canonical UTC `YYYY-MM-DD` string rather than a `Date`: a job's
 * `isOpen` compares `posted` / `closes` with plain string `>=`, which only works when every date
 * takes this one form (lexicographic order matches chronological order for `YYYY-MM-DD`).
 */
const jobDateSchema = dateSchema.transform((date) => date.toISOString().slice(0, 10))

const jobFrontmatterShape = {
  title: z.string().min(1),
  description: z.string().min(1),
  team: z.string().min(1),
  location: z.string().min(1),
  employment: z.enum(["full-time", "part-time", "contract"]),
  posted: jobDateSchema,
  closes: jobDateSchema.optional(),
  status: z.enum(["open", "closed"]).default("open"),
  salary: z.string().min(1).optional(),
  kind: z.string().min(1).default("Job Posting"),
}

/** Strict: an unknown key refuses the document. Used to validate a job posting before it is
 * trusted. */
export const jobFrontmatterSchema = z.strictObject(jobFrontmatterShape)

export type JobFrontmatter = z.infer<typeof jobFrontmatterSchema>

const legalChangeSchema = z.strictObject({
  date: dateSchema,
  summary: z.string().min(1),
})

/**
 * Strict: an unknown key refuses the document. Used to validate a legal page (terms, privacy, …)
 * before it is trusted. `page` is the page's id across languages; `changes` is its change log,
 * newest first.
 */
export const legalFrontmatterSchema = z.strictObject({
  title: z.string().min(1),
  description: z.string().min(1),
  locale: z.enum(POST_LOCALES),
  page: z.string().min(1),
  changes: z.array(legalChangeSchema).min(1),
})

export type LegalFrontmatter = z.infer<typeof legalFrontmatterSchema>
