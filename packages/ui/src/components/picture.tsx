import { cn } from "@repo/ui/lib/utils"

/** A photo exported at its full size and with its long side at 800 px (`<name>-800.<ext>`). */
export type PictureImage = {
  /** Base name under `basePath`, without extension or the `-800` suffix. */
  name: string
  width: number
  height: number
  /** The `-800` variant's pixel size; equal to the full size for a one-size image. */
  small: { width: number; height: number }
  alt: string
}

type PictureProps = {
  image: PictureImage
  /** The public directory the files are served from, `/media` unless the app says otherwise. */
  basePath?: string
  /**
   * The `sizes` attribute, the rendered width per breakpoint, so the browser picks the 800 px
   * variant wherever that is enough. Ignored with `small`.
   */
  sizes?: string
  /** Only the 800 px variant: for a card or column that never renders wider than that. */
  small?: boolean
  /** The hero's LCP image: fetched first, never lazy. Everything else is lazy and async. */
  priority?: boolean
  /** Goes on the `<img>`; the `<picture>` itself takes `pictureClassName`. */
  className?: string
  pictureClassName?: string
}

const url = (basePath: string, name: string, ext: "jpg" | "webp", small: boolean) =>
  `${basePath}/${name}${small ? "-800" : ""}.${ext}`

/**
 * A photo from the app's public `basePath` directory: WebP with a JPEG fallback, both at full size and 800 px, with
 * explicit dimensions so the layout reserves its space before it loads. A plain `<picture>`,
 * nothing from `next/image`: every page stays static and nothing runs at request time.
 */
export function Picture({
  image,
  basePath = "/media",
  sizes,
  small = false,
  priority = false,
  className,
  pictureClassName,
}: PictureProps) {
  // The posters come in one size only: no `-800` file, so never that suffix and no srcSet.
  const hasSmall = image.small.width < image.width
  const onlySmall = hasSmall && small
  const both = hasSmall && !small
  const srcSetFor = (ext: "jpg" | "webp") =>
    both
      ? `${url(basePath, image.name, ext, true)} ${image.small.width}w, ${url(basePath, image.name, ext, false)} ${image.width}w`
      : undefined
  const size = onlySmall ? image.small : image
  return (
    <picture className={cn("contents", pictureClassName)}>
      <source
        type="image/webp"
        srcSet={srcSetFor("webp") ?? url(basePath, image.name, "webp", onlySmall)}
        sizes={both ? sizes : undefined}
      />
      <img
        src={url(basePath, image.name, "jpg", onlySmall)}
        srcSet={srcSetFor("jpg")}
        sizes={both ? sizes : undefined}
        width={size.width}
        height={size.height}
        alt={image.alt}
        loading={priority ? "eager" : "lazy"}
        decoding={priority ? undefined : "async"}
        fetchPriority={priority ? "high" : undefined}
        className={className}
      />
    </picture>
  )
}
