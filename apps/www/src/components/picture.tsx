import type { MediaImage } from "@/content/media"
import { cn } from "@/lib/utils"

type PictureProps = {
  image: MediaImage
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

const url = (name: string, ext: "jpg" | "webp", small: boolean) =>
  `/media/${name}${small ? "-800" : ""}.${ext}`

/**
 * A photo from `public/media/`: WebP with a JPEG fallback, both at full size and 800 px, with
 * explicit dimensions so the layout reserves its space before it loads. A plain `<picture>`,
 * nothing from `next/image`: every page stays static and nothing runs at request time.
 */
export function Picture({
  image,
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
      ? `${url(image.name, ext, true)} ${image.small.width}w, ${url(image.name, ext, false)} ${image.width}w`
      : undefined
  const size = onlySmall ? image.small : image
  return (
    <picture className={cn("contents", pictureClassName)}>
      <source
        type="image/webp"
        srcSet={srcSetFor("webp") ?? url(image.name, "webp", onlySmall)}
        sizes={both ? sizes : undefined}
      />
      <img
        src={url(image.name, "jpg", onlySmall)}
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
