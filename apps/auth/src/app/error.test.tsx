import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { IntlReady } from "@/components/intl-ready"
import { renderIn } from "@/test-intl"
import ErrorPage from "./error"

const error = Object.assign(new Error("boom"), { digest: "abc123" })

test("outside the layout's translations (global-error) it reads English", () => {
  const html = renderToStaticMarkup(<ErrorPage error={error} reset={() => {}} />)
  expect(html).toContain("Something went wrong")
  expect(html).toContain(
    "An unexpected error occurred. Try again, or head back home. Reference: abc123"
  )
  expect(html).toContain(">Try again</button>")
})

test("under the layout it reads the request's language", () => {
  const html = renderIn(
    "sv",
    <IntlReady>
      <ErrorPage error={error} reset={() => {}} />
    </IntlReady>
  )
  expect(html).toContain("Något gick fel")
  expect(html).toContain("Referens: abc123")
  expect(html).toContain(">Försök igen</button>")
  expect(html).toContain(">Till startsidan</a>")
})
