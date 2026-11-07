import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { SignInLink } from "./sign-in-link"

describe("SignInLink", () => {
  test("links to the login page without next", () => {
    const html = renderToStaticMarkup(<SignInLink authUrl="https://auth.example.com" />)
    expect(html).toMatch(/<a [^>]*href="https:\/\/auth\.example\.com\/login"/)
    expect(html).toContain(">Sign in</a>")
  })

  test("carries an encoded next", () => {
    const next = "https://app.example.com/notes?x=1&y=2"
    const html = renderToStaticMarkup(<SignInLink authUrl="https://auth.example.com" next={next} />)
    const href = `https://auth.example.com/login?next=${encodeURIComponent(next)}`
    expect(html).toContain(`href="${href}"`)
    expect(html).toContain(">Sign in</a>")
  })
})
