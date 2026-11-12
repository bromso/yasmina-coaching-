import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { MediaClip } from "./media-clip"

describe("MediaClip", () => {
  test("server HTML is the still alone: no video, no toggle until mounted", () => {
    const html = renderToStaticMarkup(
      <MediaClip
        src="/media/hero.mp4"
        poster="/media/hero-poster.jpg"
        width={1280}
        height={720}
        still={<img src="/media/hero-poster.jpg" alt="Yasmina" />}
        labels={{ play: "Spela", pause: "Pausa" }}
        icons={{ play: <svg />, pause: <svg /> }}
        className="aspect-video"
      />
    )
    expect(html).toContain(
      '<div class="relative aspect-video"><img src="/media/hero-poster.jpg" alt="Yasmina"/></div>'
    )
    expect(html).not.toContain("<video")
    expect(html).not.toContain("<button")
  })
})
