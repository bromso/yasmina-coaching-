import { describe, expect, mock, test } from "bun:test"

// The offering view's booking forms import the server actions, which reach `@repo/session`
// and its `server-only` guard; outside a react-server bundle that guard throws.
mock.module("server-only", () => ({}))

const { renderToStaticMarkup } = await import("react-dom/server")
const { INNER, INNER_SERVICE_IDS } = await import("@/content/inner")
const { BOOKING } = await import("@/content/booking")
const { formatKr, INNER_PRICES } = await import("@/content/inner-pricing")
const { BookView } = await import("./book-view")
const { InnerHubView } = await import("./inner-hub-view")
const { InnerResearchView } = await import("./inner-research-view")
const { InnerServiceView } = await import("./inner-service-view")
const { OfferingView } = await import("./offering-view")
const { DoneView } = await import("./done-view")

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
})

describe("the booking journeys' steps", () => {
  const props = { audience: "private", minDate: "2026-11-08" } as const
  const steps = (html: string, labels: readonly string[]) => {
    for (const label of labels) expect(html).toContain(label)
  }

  for (const locale of LOCALES) {
    const form = BOOKING[locale].form

    test(`${locale}: a priced start call has four steps and all four payment methods`, () => {
      const html = render(
        <OfferingView offering="inner_start_coaching" locale={locale} {...props} />
      )
      steps(html, form.steps.instant)
      expect(html).toContain(`aria-label="${form.stepOf(1, 4)}"`)
      expect(html).toContain('aria-current="step"')
      for (const method of ["apple_pay", "google_pay", "swish", "invoice"] as const) {
        expect(html).toContain(form.payment.methods[method].label)
      }
      expect(html).toContain(form.payment.testMode)
      expect(html).toContain('name="paymentMethod"')
      // The Swish number and invoice details are never named fields: nothing of them is posted.
      expect(html).not.toContain('name="swishNumber"')
      expect(html).not.toContain(form.payment.invoiceOnly)
    })

    test(`${locale}: an offering priced in writing offers invoice only`, () => {
      for (const offering of ["session", "group"] as const) {
        const html = render(<OfferingView offering={offering} locale={locale} {...props} />)
        expect(html).toContain(form.payment.invoiceOnly)
        expect(html).toContain(form.payment.methods.invoice.label)
        expect(html).not.toContain(form.payment.methods.swish.hint)
        expect(html).not.toContain(form.payment.methods.apple_pay.hint)
      }
    })

    test(`${locale}: members' sessions and programme extras have three steps and no payment`, () => {
      for (const node of [
        <OfferingView key="m" offering="inner_session" locale={locale} {...props} />,
        <OfferingView key="p" offering="package_6" packageId="12" locale={locale} {...props} />,
      ]) {
        const html = render(node)
        expect(html).toContain(`aria-label="${form.stepOf(1, 3)}"`)
        expect(html).not.toContain(form.payment.testMode)
        expect(html).not.toContain('name="paymentMethod"')
      }
    })

    test(`${locale}: the group picks a session, then details, then pays`, () => {
      const html = render(<OfferingView offering="inner_group" locale={locale} {...props} />)
      steps(html, form.steps.group)
      expect(html).toContain(form.payment.methods.swish.label)
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
})
