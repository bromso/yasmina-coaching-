/** A fenced code block: ``` or ~~~ (three or more), up to the matching closing fence or the end. */
const FENCE = /^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^ {0,3}\1[`~]*[ \t]*$|(?![\s\S]))/gm
/** An inline code span: a run of backticks up to the same run. */
const INLINE_CODE = /(`+)[^`]*?\1/g
/** A markdown image, `![alt](src)` or `![alt](src "title")`. */
const MARKDOWN_IMAGE = /!\[[^\]]*\]\(\s*<?([^\s)>]+)>?(?:\s+["'(][^)]*)?\)/g
/** A markdown link's target, `[text](target)` or `[text](target "title")`. */
const MARKDOWN_LINK = /\[[^\]]*\]\(\s*<?([^\s)>]+)>?(?:\s+["'(][^)]*)?\)/g
/** A reference definition, `[ref]: target "title"`, on its own line; not a footnote (`[^1]: …`). */
const REFERENCE = /^ {0,3}\[(?!\^)[^\]]+\]:[ \t]*<?([^\s>]+)>?/gm
/** An `href` attribute on a JSX or HTML element, single- or double-quoted. */
const HREF = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/g
/** A `src` attribute on a JSX or HTML element, single- or double-quoted. */
const SRC = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/g

/** The YAML frontmatter block at the top of a page, whose `#` lines are comments. */
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/
/** An ATX h1, `# Title` (or a bare `#`), indented at most three spaces. */
const ATX_H1 = /^ {0,3}#(?:[ \t]|$)/m
/** A setext h1: a non-blank line underlined with `=`. */
const SETEXT_H1 = /^[ \t]{0,3}\S.*\r?\n {0,3}=+[ \t]*$/m

/** The source with code removed: examples in fenced blocks and inline spans are not links. */
function prose(source: string): string {
  return source.replace(FENCE, "").replace(INLINE_CODE, "")
}

/** Every capture of `patterns` in `text`, in document order. */
function collect(text: string, patterns: RegExp[]): string[] {
  const found: { index: number; value: string }[] = []
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = match[1] ?? match[2]
      if (value) found.push({ index: match.index, value })
    }
  }
  return found.sort((a, b) => a.index - b.index).map(({ value }) => value)
}

/**
 * Every link target in a page's raw MDX source, in document order: markdown links (inline and
 * reference definitions) and `href` attributes, skipping code. Images are not links — they are
 * files, checked by `extractImages` — so each is blanked first, which also leaves a linked image
 * `[![alt](/b.png)](/target)` as the link `/target`. A reference definition counts as a link even
 * when only an image uses it (`![alt][ref]`); write such images inline so they are checked as files.
 */
export function extractLinks(source: string): string[] {
  const text = prose(source).replace(MARKDOWN_IMAGE, (image) => " ".repeat(image.length))
  return collect(text, [MARKDOWN_LINK, REFERENCE, HREF])
}

/** Every image source in a page's raw MDX: inline markdown images and `src` attributes. */
export function extractImages(source: string): string[] {
  return collect(prose(source), [MARKDOWN_IMAGE, SRC])
}

/**
 * Images that would 404: a root-relative `src` must name a file under `public/` (`exists` is
 * asked with the decoded path, query and fragment dropped). Remote, protocol-relative and other
 * schemes are left alone.
 */
export function imageProblems(
  file: string,
  images: string[],
  exists: (path: string) => boolean
): string[] {
  const problems: string[] = []
  for (const src of images) {
    if (!src.startsWith("/") || src.startsWith("//")) continue
    const bare = src.split(/[?#]/)[0] ?? src
    let path: string
    try {
      path = decodeURIComponent(bare)
    } catch {
      path = bare
    }
    if (!exists(path)) problems.push(`${file}: image "${src}" not found in public/`)
  }
  return problems
}

/**
 * The page's title is its only `<h1>` (rendered by the page's own header), so a body heading must
 * start at `##`. One problem per page, whether it uses `# Title` or a `===`-underlined line; code
 * and the frontmatter (YAML comments start with `#`) are ignored. `titleOwner` names what owns
 * that title in the message (default `"page"`; the blog passes `"post"`).
 */
export function headingProblems(file: string, source: string, titleOwner?: string): string[] {
  const body = prose(source.replace(FRONTMATTER, ""))
  return ATX_H1.test(body) || SETEXT_H1.test(body)
    ? [`${file}: use "##" for headings — the ${titleOwner ?? "page"} title is the page's h1`]
    : []
}
