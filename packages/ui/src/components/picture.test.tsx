import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { Picture, type PictureImage } from "./picture"

const photo: PictureImage = {
  name: "portrait-office",
  width: 896,
  height: 1200,
  small: { width: 597, height: 800 },
  alt: "Yasmina vid sitt skrivbord",
}

/** A poster: one size only, so its `small` is the full size. */
const poster: PictureImage = {
  name: "hero-poster",
  width: 1280,
  height: 720,
  small: { width: 1280, height: 720 },
  alt: "",
}

describe("Picture", () => {
  test("builds the WebP and JPEG sources under /media, both sizes", () => {
    const html = renderToStaticMarkup(<Picture image={photo} sizes="50vw" />)
    expect(html).toContain(
      '<source type="image/webp" srcSet="/media/portrait-office-800.webp 597w, /media/portrait-office.webp 896w" sizes="50vw"/>'
    )
    expect(html).toContain('src="/media/portrait-office.jpg"')
    expect(html).toContain(
      'srcSet="/media/portrait-office-800.jpg 597w, /media/portrait-office.jpg 896w"'
    )
    expect(html).toContain('width="896" height="1200" alt="Yasmina vid sitt skrivbord"')
    expect(html).toContain('loading="lazy" decoding="async"')
  })

  test("takes another basePath", () => {
    const html = renderToStaticMarkup(<Picture image={photo} basePath="/images" />)
    expect(html).toContain("/images/portrait-office-800.webp 597w")
    expect(html).toContain('src="/images/portrait-office.jpg"')
    expect(html).not.toContain("/media/")
  })

  test("small: only the 800 px variant, at its size", () => {
    const html = renderToStaticMarkup(<Picture image={photo} small sizes="50vw" />)
    expect(html).toContain('<source type="image/webp" srcSet="/media/portrait-office-800.webp"/>')
    expect(html).toContain('src="/media/portrait-office-800.jpg"')
    expect(html).toContain('width="597" height="800"')
    expect(html).not.toContain("sizes=")
  })

  test("a one-size image never gets the -800 suffix", () => {
    const html = renderToStaticMarkup(<Picture image={poster} small />)
    expect(html).not.toContain("-800")
    expect(html).toContain('src="/media/hero-poster.jpg"')
  })

  test("priority: eager and high, not async", () => {
    const html = renderToStaticMarkup(<Picture image={photo} priority className="object-cover" />)
    expect(html).toContain('loading="eager" fetchPriority="high" class="object-cover"')
    expect(html).not.toContain("decoding")
  })
})
