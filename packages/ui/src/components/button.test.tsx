import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { Button } from "./button"

const classOf = (html: string) => (html.match(/class="([^"]*)"/)?.[1] ?? "").split(" ")

describe("Button", () => {
  test("is a pill in every size, www's shape", () => {
    for (const size of ["default", "xs", "sm", "lg", "icon", "icon-xs", "icon-sm", "icon-lg"]) {
      const classes = classOf(
        renderToStaticMarkup(
          <Button size={size as "default"} type="button">
            x
          </Button>
        )
      )
      expect(classes).toContain("rounded-full")
      expect(classes).not.toContain("rounded-md")
    }
  })

  test("the default is the charcoal primary", () => {
    const classes = classOf(renderToStaticMarkup(<Button type="button">x</Button>))
    expect(classes).toContain("bg-primary")
    expect(classes).toContain("text-primary-foreground")
  })

  test("a className still overrides the radius", () => {
    const classes = classOf(
      renderToStaticMarkup(
        <Button className="rounded-md" type="button">
          x
        </Button>
      )
    )
    expect(classes).toContain("rounded-md")
    expect(classes).not.toContain("rounded-full")
  })
})
