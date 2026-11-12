import { describe, expect, mock, test } from "bun:test"

// The offering view's booking forms import the server actions, which reach `@repo/session`
// and its `server-only` guard; outside a react-server bundle that guard throws.
mock.module("server-only", () => ({}))

const { renderToStaticMarkup } = await import("react-dom/server")
const { legalUrl } = await import("@repo/sites/legal")
const { INNER, INNER_SERVICE_IDS } = await import("@/content/inner")
const { BOOKING } = await import("@/content/booking")
const { formatKr, INNER_PRICES } = await import("@/content/inner-pricing")
const { BookView } = await import("./book-view")
const { InnerHubView } = await import("./inner-hub-view")
const { InnerResearchView } = await import("./inner-research-view")
const { InnerServiceView } = await import("./inner-service-view")
const { OfferingView } = await import("./offering-view")
const { DoneView } = await import("./done-view")
const { LocaleProvider } = await import("@/components/booking/locale-provider")
const { PaymentError, PaymentStep } = await import("@/components/booking/payment-step")
const { stepWithError, withClientErrors } = await import("@/components/booking/step-panel")
const { EarlyStartField, TermsField } = await import("@/components/booking/details-fields")
type PaymentStepProps = import("@/components/booking/payment-step").PaymentStepProps

const LOCALES = ["sv", "en"] as const

/** The markup with non-breaking spaces as plain ones, so "2 700 kr" reads as it looks. */
const render = (node: React.ReactElement) =>
  renderToStaticMarkup(node).replaceAll("\u00a0", " ").replaceAll("&nbsp;", " ")

const count = (html: string, pattern: RegExp) => html.match(pattern)?.length ?? 0

describe("InnerServiceView", () => {
  for (const locale of LOCALES) {
    test(`coachning in ${locale}: its prices, the start call and the members' session`, () => {
      const html = render(<InnerServiceView id="coaching" locale={locale} />)
      expect(html).toContain("2 700 kr")
      expect(html).toContain("2 250 kr")
      expect(html).toContain("7 650 kr")
      expect(html).toContain('href="/book/inner_start_coaching"')
      expect(html).toContain('href="/book/inner_session"')
      const labels = INNER[locale].labels
      expect(html).toContain(labels.package.vatPrivate)
      expect(html).toContain(labels.package.vatOrganisation)
      expect(count(html, /<h1[\s>]/g)).toBe(1)
    })
  }

  test("every service in both languages: one h1, its own title and the right booking links", () => {
    for (const locale of LOCALES) {
      for (const id of INNER_SERVICE_IDS) {
        const service = INNER[locale].services[id]
        const html = render(<InnerServiceView id={id} locale={locale} />)
        expect(count(html, /<h1[\s>]/g)).toBe(1)
        expect(html).toContain(service.title)
        expect(html).toContain(formatKr(INNER_PRICES[id].monthly, locale).replaceAll("\u00a0", " "))
        for (const key of [service.startOffering, service.memberOffering, service.groupOffering]) {
          if (key) expect(html).toContain(`href="/book/${key}"`)
        }
        expect(html).toContain('href="/inifran"')
      }
    }
  })

  test("the group's price is per person, with no start call", () => {
    const html = render(<InnerServiceView id="group" locale="sv" />)
    expect(html).toContain("1 980 kr")
    expect(html).toContain(INNER.sv.labels.package.monthlyPerPerson)
    expect(html).not.toContain(INNER.sv.labels.package.start)
  })
})

describe("InnerHubView", () => {
  for (const locale of LOCALES) {
    test(`${locale}: one h1, the services list the hero links to, and every service page`, () => {
      const html = render(<InnerHubView locale={locale} />)
      expect(count(html, /<h1[\s>]/g)).toBe(1)
      expect(html).toContain('id="services"')
      for (const slug of ["coachning", "mentorskap", "livsstil", "grupp"]) {
        expect(html).toContain(`href="/inifran/${slug}"`)
      }
      expect(html).toContain('href="/inifran/forskning"')
      expect(html).toContain(INNER[locale].hub.certification.line)
    })
  }
})

describe("InnerResearchView", () => {
  for (const locale of LOCALES) {
    test(`${locale}: every finding and limit, and the fourteen numbered sources`, () => {
      const research = INNER[locale].research
      const html = render(<InnerResearchView locale={locale} />)
      expect(count(html, /<h1[\s>]/g)).toBe(1)
      for (const finding of research.findings) expect(html).toContain(finding.claim)
      for (const limit of research.limits) expect(html).toContain(limit)
      for (const ref of research.references) {
        expect(html).toContain(`id="ref-${ref.n}"`)
        expect(html).toContain(`href="${ref.url}"`)
      }
      expect(html).toContain('href="#ref-14"')
    })
  }
})

describe("BookView", () => {
  for (const locale of LOCALES) {
    test(`${locale}: two headed groups, the start calls and the group listed, members' sessions never`, () => {
      const html = render(<BookView audience="private" locale={locale} />)
      for (const group of BOOKING[locale].catalogGroups) expect(html).toContain(group.title)
      expect(html).toContain('href="/book/inner_start_coaching?for=private"')
      expect(html).toContain('href="/book/inner_group?for=private"')
      expect(html).not.toContain("/book/inner_session")
      expect(html).not.toContain("/book/inner_mentoring_session")
    })
  }

  test("inner offerings show their fixed price, with VAT per audience; others the written quote", () => {
    const privateHtml = render(<BookView audience="private" locale="sv" />)
    expect(privateHtml).toContain("2 250 kr")
    expect(privateHtml).toContain("1 980 kr")
    expect(privateHtml).toContain(BOOKING.sv.priceNote)
    expect(privateHtml).toContain(BOOKING.sv.innerPrice.vat.private)
    const orgHtml = render(<BookView audience="organisation" locale="en" />)
    expect(orgHtml).toContain("2 250 kr")
    expect(orgHtml).toContain(BOOKING.en.innerPrice.vat.organisation)
  })
})

describe("OfferingView", () => {
  const props = { audience: "private", minDate: "2026-11-08" } as const

  test("a start call shows its price instead of the written quote", () => {
    const html = render(<OfferingView offering="inner_start_coaching" locale="sv" {...props} />)
    expect(html).toContain("2 250 kr")
    expect(html).not.toContain(BOOKING.sv.priceNote)
  })

  test("a members' session opened by link renders, and says the membership covers it", () => {
    const html = render(<OfferingView offering="inner_session" locale="en" {...props} />)
    expect(html).toContain(BOOKING.en.offerings.inner_session.title)
    expect(html).toContain(BOOKING.en.innerPrice.member)
    expect(html).not.toContain(BOOKING.en.priceNote)
  })

  test("the Inifrån group shows its price per person; leadership offerings keep the quote", () => {
    expect(render(<OfferingView offering="inner_group" locale="sv" {...props} />)).toContain(
      "1 980 kr"
    )
    expect(render(<OfferingView offering="session" locale="sv" {...props} />)).toContain(
      BOOKING.sv.priceNote
    )
  })

  test("the keynote opens on its film's still", () => {
    const html = render(<OfferingView offering="keynote" locale="sv" {...props} />)
    expect(html).toContain("/media/keynote-poster")
  })

  // Every journey kind (instant, group, request) carries the terms box, its links in the page's
  // language, computed on the server; it is a plain required checkbox, so it posts without JS.
  for (const locale of LOCALES) {
    for (const offering of ["session", "group", "workshop"] as const) {
      test(`${offering} (${locale}): the terms box links the terms and the privacy policy`, () => {
        const html = render(<OfferingView offering={offering} locale={locale} {...props} />)
        const copy = BOOKING[locale].form.terms
        expect(html).toMatch(/<input type="checkbox" required=""[^>]* name="terms" value="on"/)
        expect(html).toContain(`href="${legalUrl("terms", locale)}"`)
        expect(html).toContain(`href="${legalUrl("privacy", locale)}"`)
        expect(html).toContain(copy.before)
        expect(html).toContain(copy.terms)
        expect(html).toContain(copy.privacy)
      })
    }
  }
})

describe("the box for a start within the withdrawal period", () => {
  const minDate = "2026-11-08"
  const box = /<input type="checkbox" required=""[^>]* name="earlyStart" value="on"/

  // Nothing is picked in the server's render (nor without JavaScript), so a private client's
  // instant or group journey shows the box: any offered session could fall inside the period.
  for (const locale of LOCALES) {
    for (const offering of ["session", "group", "inner_start_coaching"] as const) {
      test(`${offering} (${locale}): a private client sees the box and its label`, () => {
        const html = render(
          <OfferingView offering={offering} audience="private" locale={locale} minDate={minDate} />
        )
        expect(html).toMatch(box)
        expect(html).toContain(BOOKING[locale].form.earlyStart)
      })
    }
    test(`session (${locale}): an organisation never sees it`, () => {
      const html = render(
        <OfferingView
          offering="session"
          audience="organisation"
          locale={locale}
          minDate={minDate}
        />
      )
      expect(html).not.toContain('name="earlyStart"')
    })
    test(`workshop (${locale}): a request never shows it`, () => {
      const html = render(
        <OfferingView
          offering="workshop"
          audience="organisation"
          locale={locale}
          minDate={minDate}
        />
      )
      expect(html).not.toContain('name="earlyStart"')
    })
  }
})

describe("the consent boxes after a refusal", () => {
  const links = {
    terms: "https://legal.example.com/villkor",
    privacy: "https://legal.example.com/p",
  }
  const refused = (values: Record<string, string>) => ({
    ok: false as const,
    fieldErrors: { terms: "Terms message", earlyStart: "Early-start message" },
    values,
  })
  const boxes = (state: ReturnType<typeof refused>) =>
    render(
      <LocaleProvider locale="sv">
        <TermsField state={state} links={links} />
        <EarlyStartField state={state} />
      </LocaleProvider>
    )
  const input = (html: string, name: string) =>
    new RegExp(`<input[^>]* name="${name}"[^>]*>`).exec(html)?.[0] ?? ""

  test("each refused box is invalid and described by its own message", () => {
    const html = boxes(refused({ terms: "", earlyStart: "" }))
    for (const [name, message] of [
      ["terms", "Terms message"],
      ["earlyStart", "Early-start message"],
    ] as const) {
      const tag = input(html, name)
      expect(tag).toContain('aria-invalid="true"')
      expect(tag).toContain(`aria-describedby="${name}-error"`)
      expect(tag).not.toContain('checked=""')
      expect(html).toContain(
        `<p id="${name}-error" class="text-destructive text-sm">${message}</p>`
      )
    }
  })

  test("a box ticked before the refusal stays ticked", () => {
    const html = boxes(refused({ terms: "on", earlyStart: "on" }))
    for (const name of ["terms", "earlyStart"]) {
      expect(input(html, name)).toContain('checked=""')
      expect(input(html, name)).toContain('aria-invalid="true"')
    }
  })

  test("the terms box's name is the sentence alone: the new-tab note describes each link", () => {
    const html = boxes(refused({}))
    const label = /<label[^>]*>[\s\S]*?<\/label>/.exec(html)?.[0] ?? ""
    expect(label).toContain(BOOKING.sv.form.terms.terms)
    expect(label).not.toContain(BOOKING.sv.form.terms.newTab)
    const note = /<span id="([^"]+)" hidden="">\(öppnas i en ny flik\)<\/span>/.exec(html)
    const id = note?.[1] ?? "missing"
    expect(count(label, new RegExp(`aria-describedby="${id}"`, "g"))).toBe(2)
    expect(count(html, /\(öppnas i en ny flik\)/g)).toBe(1)
  })
})

describe("the booking journeys' steps", () => {
  const props = { audience: "private", minDate: "2026-11-08" } as const
  const steps = (html: string, labels: readonly string[]) => {
    for (const label of labels) expect(html).toContain(label)
  }

  for (const locale of LOCALES) {
    const form = BOOKING[locale].form

    test(`${locale}: an instant booking has four steps; the payment step loads later`, () => {
      const html = render(
        <OfferingView offering="inner_start_coaching" locale={locale} {...props} />
      )
      steps(html, form.steps.instant)
      expect(html).toContain(`aria-label="${form.stepOf(1, 4)}"`)
      expect(html).toContain('aria-current="step"')
      // Lazily loaded once the visitor reaches the details step: none of it in the first HTML.
      expect(html).not.toContain(form.payment.testMode)
      expect(html).not.toContain('name="paymentMethod"')
    })

    test(`${locale}: members' sessions and programme extras have three steps and no payment`, () => {
      for (const node of [
        <OfferingView key="m" offering="inner_session" locale={locale} {...props} />,
        <OfferingView key="p" offering="package_6" packageId="12" locale={locale} {...props} />,
      ]) {
        const html = render(node)
        expect(html).toContain(`aria-label="${form.stepOf(1, 3)}"`)
        expect(html).not.toContain(form.steps.instant[2] ?? "-")
      }
    })

    test(`${locale}: the group picks a session, then details, then pays`, () => {
      const html = render(<OfferingView offering="inner_group" locale={locale} {...props} />)
      steps(html, form.steps.group)
    })

    test(`${locale}: a request reviews before sending, and says nothing is paid now`, () => {
      const html = render(<OfferingView offering="workshop" locale={locale} {...props} />)
      steps(html, form.steps.request)
      expect(html).toContain(form.review.note)
      expect(html).not.toContain(form.payment.testMode)
      // Without JavaScript every step shows, as one form.
      expect(html).toContain("<noscript><style>")
    })
  }
})

describe("PaymentStep", () => {
  const base = {
    active: true,
    audience: "private",
    offering: "Startsamtal",
    when: ["tisdag 10 november 2026, 09:00–10:30"],
    email: "ada@example.com",
    state: { ok: false },
    pending: false,
    submit: () => {},
  } as const
  const step = (locale: "sv" | "en", props: Partial<PaymentStepProps> = {}) =>
    render(
      <LocaleProvider locale={locale}>
        <PaymentStep {...base} price={{ amount: 2250, per: "session" }} {...props} />
      </LocaleProvider>
    )

  for (const locale of LOCALES) {
    const form = BOOKING[locale].form

    test(`${locale}: a fixed price with the mock on offers all four methods and says test mode`, () => {
      const html = step(locale)
      for (const method of ["apple_pay", "google_pay", "swish", "invoice"] as const) {
        expect(html).toContain(form.payment.methods[method].label)
      }
      expect(html).toContain(form.payment.testMode)
      expect(html).toContain('name="paymentMethod"')
      expect(html).toContain("2 250 kr")
      expect(html).toContain(form.payment.summary.vatIncluded)
    })

    test(`${locale}: the mock off, or no fixed price, leaves invoice only and no test mode`, () => {
      for (const html of [step(locale, { mock: false }), step(locale, { price: null })]) {
        expect(html).toContain(form.payment.methods.invoice.label)
        expect(html).not.toContain(form.payment.methods.swish.hint)
        expect(html).not.toContain(form.payment.testMode)
      }
      // Invoice is the only choice, so it is already chosen and its own line shows once.
      const quoted = step(locale, { price: null })
      expect(quoted).toContain(form.payment.invoice.private.unpriced("ada@example.com"))
      expect(quoted).not.toContain(form.payment.invoice.private.priced("ada@example.com"))
      expect(quoted).toContain(form.payment.summary.unpriced)
    })

    test(`${locale}: an organisation's invoice asks for its billing details, posted by name`, () => {
      const html = step(locale, { audience: "organisation", mock: false })
      expect(html).toContain(form.payment.invoice.organisation.priced)
      for (const name of ["invoiceOrgNumber", "invoiceReference", "invoiceAddress"]) {
        expect(html).toContain(`name="${name}"`)
      }
      expect(html).not.toContain('autoComplete="email"')
      expect(html).not.toContain('autocomplete="email"')
      // Organisations pay excl. VAT, with the VAT added: 2 250 kr → 563 kr VAT, 2 813 kr in all.
      expect(html).toContain(form.payment.summary.vatAdded)
      expect(html).toContain("563 kr")
      expect(html).toContain("2 813 kr")
    })

    test(`${locale}: the group's months multiply the monthly price, VAT on the total`, () => {
      const html = step(locale, { price: { amount: 1980, per: "month" }, quantity: 2 })
      expect(html).toContain("2 × 1 980 kr")
      expect(html).toContain("3 960 kr")
      expect(html).toContain("792 kr")
    })

    test(`${locale}: the action's error shows beside the pay button`, () => {
      const html = step(locale, { state: { ok: false, message: "Tiden är tagen." } })
      expect(html).toContain('role="alert"')
      expect(html).toContain("Tiden är tagen.")
      expect(html).not.toContain(form.payment.nothingCharged)
    })

    test(`${locale}: after an approved mock, the error says nothing was charged`, () => {
      const html = render(
        <PaymentError
          state={{ ok: false, message: "Tiden är tagen." }}
          afterApproval
          copy={form.payment}
        />
      )
      expect(html).toContain("Tiden är tagen.")
      expect(html).toContain(form.payment.nothingCharged)
      expect(render(<PaymentError state={{ ok: true }} afterApproval copy={form.payment} />)).toBe(
        ""
      )
    })
  }

  test("the nothing-charged line in both languages", () => {
    expect(BOOKING.sv.form.payment.nothingCharged).toBe("Ingen betalning har dragits.")
    expect(BOOKING.en.form.payment.nothingCharged).toBe("Nothing has been charged.")
  })
})

describe("step helpers", () => {
  test("stepWithError: the first step holding a refused field", () => {
    const fields = [["slots"], ["name", "email"], ["paymentMethod", "invoiceOrgNumber"]]
    expect(stepWithError({ ok: true }, fields)).toBeNull()
    expect(stepWithError({ ok: false, message: "x" }, fields)).toBeNull()
    expect(stepWithError({ ok: false, fieldErrors: { email: "e" } }, fields)).toBe(2)
    expect(
      stepWithError({ ok: false, fieldErrors: { invoiceOrgNumber: "o", email: "e" } }, fields)
    ).toBe(2)
    expect(stepWithError({ ok: false, fieldErrors: { invoiceOrgNumber: "o" } }, fields)).toBe(3)
    expect(stepWithError({ ok: false, fieldErrors: { unknown: "u" } }, fields)).toBeNull()
  })

  test("withClientErrors: the browser's checks over the server's answer", () => {
    const server = {
      ok: false as const,
      message: "Fel",
      code: "CONFLICT",
      fieldErrors: { name: "server", email: "server" },
      values: { name: "Ada" },
    }
    expect(withClientErrors(server, {})).toBe(server)
    expect(withClientErrors(server, { email: "client" })).toEqual({
      ok: false,
      message: "Fel",
      code: "CONFLICT",
      values: { name: "Ada" },
      fieldErrors: { name: "server", email: "client" },
    })
    expect(withClientErrors({ ok: true }, { name: "client" })).toEqual({
      ok: false,
      message: undefined,
      code: undefined,
      values: undefined,
      fieldErrors: { name: "client" },
    })
  })
})

describe("DoneView", () => {
  for (const locale of LOCALES) {
    const booking = BOOKING[locale]
    test(`${locale}: the last step of each journey, and how it was paid`, () => {
      for (const kind of ["instant", "group", "request", "member"] as const) {
        const total = booking.form.steps[kind].length
        const html = render(<DoneView reference="BK-1" kind={kind} paid="swish" locale={locale} />)
        expect(html).toContain(`aria-label="${booking.form.stepOf(total, total)}"`)
        if (kind === "instant" || kind === "group") expect(html).toContain(booking.done.paid.swish)
        else expect(html).not.toContain(booking.done.paid.swish)
      }
      const unpaid = render(<DoneView reference="BK-1" kind="instant" locale={locale} />)
      for (const line of Object.values(booking.done.paid)) expect(unpaid).not.toContain(line)
    })
  }

  test("invoice lines: one per case, none in test mode, none claiming an address a client never gave", () => {
    for (const locale of LOCALES) {
      const paid = BOOKING[locale].done.paid
      const lines = [paid.invoice, paid.invoice_org, paid.invoice_quote]
      expect(new Set(lines).size).toBe(3)
      for (const line of lines) expect(line).not.toMatch(/testläge|test mode/)
      expect(paid.invoice).not.toMatch(/fakturaadress|invoice address/)
      for (const key of ["apple_pay", "google_pay", "swish"] as const) {
        expect(paid[key]).toMatch(/testläge|test mode/)
      }
    }
  })
})

const { ContactView } = await import("./contact-view")
const { ContactDoneView } = await import("./contact-done-view")
const { CONTACT } = await import("@/content/contact")
/** A string as React writes it into markup. */
const esc = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("'", "&#x27;").replaceAll('"', "&quot;")

describe("ContactView", () => {
  for (const locale of LOCALES) {
    test(`${locale}: one h1, the response time, and three steps in one plain form`, () => {
      const copy = CONTACT[locale]
      const html = render(<ContactView page="/kontakt" locale={locale} />)
      expect(count(html, /<h1[\s>]/g)).toBe(1)
      expect(html).toContain(esc(copy.hero.title))
      expect(html).toContain(esc(copy.hero.response))
      // Every step is in the markup (hidden but mounted), so the form also works as one long page.
      for (const heading of copy.form.steps.slice(0, 3)) expect(html).toContain(esc(heading))
      expect(count(html, /class="step-panel /g)).toBe(3)
      expect(html).toContain("<noscript>")
      expect(html).toContain(".step-panel{display:grid!important}")
      expect(html).toContain('<input type="hidden" name="page" value="/kontakt"/>')
      for (const label of Object.values(copy.form.need.labels)) expect(html).toContain(esc(label))
      for (const label of Object.values(copy.form.timeline.labels))
        expect(html).toContain(esc(label))
      expect(html).toContain(`href="${legalUrl("privacy", locale)}"`)
    })
  }

  test("neither consent box is ticked to start with; e-mail is the preselected contact method", () => {
    const html = render(<ContactView page="/kontakt" locale="sv" />)
    for (const name of ["consent", "newsletter"]) {
      const input = html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))?.[0] ?? ""
      expect(input).toContain('type="checkbox"')
      expect(input).not.toContain('checked=""')
    }
    const email = html.match(/<input[^>]*name="contactMethod"[^>]*value="email"[^>]*>/)?.[0] ?? ""
    expect(email).toContain('checked=""')
  })

  test("a group's error is tied to its fieldset: aria-invalid and aria-describedby", async () => {
    const { Fieldset } = await import("@/components/booking/details-fields")
    const state = { ok: false as const, fieldErrors: { need: "Välj vad du vill ha hjälp med." } }
    const html = render(
      <Fieldset legend="Vad?" hint="En sak" field={{ name: "need", state }}>
        <input type="radio" name="need" value="x" />
      </Fieldset>
    )
    expect(html).toContain('aria-invalid="true"')
    expect(html).toContain('aria-describedby="need-hint need-error"')
    expect(html).toContain('<p id="need-error"')
    const fine = render(
      <Fieldset legend="Vad?" field={{ name: "need", state: { ok: false } }}>
        <span />
      </Fieldset>
    )
    expect(fine).not.toContain("aria-invalid")
    expect(fine).not.toContain("aria-describedby")
  })

  test("the organisation fields are hidden until an organisation is picked, but shown without JavaScript", () => {
    const html = render(<ContactView page="/kontakt" locale="sv" />)
    expect(html).toMatch(/class="org-fields [^"]*hidden"/)
    expect(html).toContain(".org-fields{display:grid!important}")
  })
})

describe("ContactDoneView", () => {
  const blogUrl = "https://blog.example.com"
  const done = (
    answers: Parameters<typeof ContactDoneView>[0]["answers"],
    locale: "sv" | "en" = "sv"
  ) =>
    render(
      <ContactDoneView reference="LEAD-7" answers={answers} blogUrl={blogUrl} locale={locale} />
    )

  test("Ledarskap inifrån links the matching start call", () => {
    const html = done({ audience: "private", need: "inner_mentoring", timeline: "month" })
    expect(html).toContain('href="/book/inner_start_mentoring"')
    expect(html).toContain(CONTACT.sv.done.next.inner.title)
  })

  test("leadership coaching offers the intro call and a session", () => {
    const html = done({ audience: "private", need: "coaching", timeline: "quarter" })
    expect(html).toContain('href="/book/session"')
    expect(html).toContain(CONTACT.sv.done.next.coaching.title)
  })

  test("an organisation's team day, workshop or talk gets a proposal and the request form", () => {
    expect(done({ audience: "organisation", need: "team", timeline: "month" })).toContain(
      'href="/book/workshop"'
    )
    const talk = done({ audience: "organisation", need: "talk", timeline: "exploring" })
    expect(talk).toContain('href="/book/keynote"')
    expect(talk).toContain(CONTACT.sv.done.next.proposal.title)
  })

  test("exploring reads two posts in the page's language and the inifrån hub", () => {
    for (const locale of LOCALES) {
      const html = done({ audience: "private", need: "unsure", timeline: "exploring" }, locale)
      expect(html).toContain(esc(CONTACT[locale].done.next.explore.title))
      expect(html).toContain('href="/inifran"')
      const posts =
        locale === "sv"
          ? ["mentor-eller-coach", "vad-forskningen-sager-om-coachning"]
          : ["en-mentor-or-coach", "en-what-research-says-about-coaching"]
      for (const slug of posts) expect(html).toContain(`href="${blogUrl}/${slug}"`)
    }
  })

  test("an organisation buying coaching gets the proposal and the enterprise request form", () => {
    const html = done({ audience: "organisation", need: "coaching", timeline: "month" })
    expect(html).toContain('href="/book/enterprise"')
    expect(html).not.toContain('href="/book/session"')
  })

  test("a spoofed reference renders nothing: only LEAD-<digits> reaches the page", async () => {
    const { parseDone } = await import("@/lib/leads")
    const { reference } = parseDone({ ref: "Ring 070-123 45 67 för att avsluta" })
    const html = render(
      <ContactDoneView reference={reference} answers={null} blogUrl={blogUrl} locale="sv" />
    )
    expect(html).not.toContain("070-123")
    expect(html).not.toContain(CONTACT.sv.done.reference)
  })

  test("without known answers there is no tailored step, only the reference and what happens now", () => {
    const html = done(null)
    expect(html).not.toContain('id="next-step-title"')
    expect(html).toContain("LEAD-7")
    expect(html).toContain(CONTACT.sv.done.whatNow.heading)
    for (const item of CONTACT.sv.done.whatNow.items) expect(html).toContain(item)
    expect(html).toContain('aria-current="step"')
    expect(count(html, /<h1[\s>]/g)).toBe(1)
  })
})
