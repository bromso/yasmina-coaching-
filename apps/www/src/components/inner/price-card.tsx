import { ArrowLink } from "@repo/ui/components/arrow-link"
import { Button } from "@repo/ui/components/button"
import { SunPanel } from "@repo/ui/components/sun-panel"
import type { InnerLabels, InnerService } from "@/content/inner"
import { formatKr } from "@/content/inner-pricing"
import type { Locale } from "@/lib/site-locale"

type PriceCardProps = {
  service: InnerService
  prices: { start?: number; monthly: number; quarter: number }
  labels: InnerLabels
  locale: Locale
}

/**
 * The package and its price: the start call (one-to-one services only), the membership per
 * month (per person for the group) and three months in advance, each a term with its amount in
 * large serif and what it holds. VAT is spelled out in words, not colour; then the primary
 * booking button and, for members, the link to their next session.
 */
export function PriceCard({ service, prices, labels, locale }: PriceCardProps) {
  const { package: text, book } = labels
  const kr = (amount: number) => formatKr(amount, locale)
  const primary = service.startOffering
    ? { label: book.start, href: `/book/${service.startOffering}` }
    : service.groupOffering
      ? { label: book.group, href: `/book/${service.groupOffering}` }
      : undefined
  const rows = [
    prices.start === undefined || !service.package.start
      ? undefined
      : { term: text.start, amount: prices.start, detail: service.package.start },
    {
      term: service.groupOffering ? text.monthlyPerPerson : text.monthly,
      amount: prices.monthly,
      detail: service.package.monthly,
    },
    { term: text.quarter, amount: prices.quarter, detail: undefined },
  ].filter((row) => row !== undefined)
  return (
    <SunPanel
      as="section"
      id="price"
      aria-labelledby="price-title"
      className="scroll-mt-24 px-6 py-10 sm:px-10 lg:px-14 lg:py-14"
    >
      <h2 id="price-title" className="text-balance text-4xl sm:text-5xl">
        {text.title}
      </h2>
      <dl className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-6">
        {rows.map((row) => (
          <div
            key={row.term}
            className="flex flex-col gap-2 border-foreground/20 border-t pt-5 dark:border-border/70"
          >
            <dt className="font-medium text-muted-foreground text-xs uppercase tracking-[0.18em]">
              {row.term}
            </dt>
            <dd className="font-display text-4xl text-foreground">{kr(row.amount)}</dd>
            {row.detail && (
              <dd className="text-pretty text-muted-foreground text-sm leading-relaxed">
                {row.detail}
              </dd>
            )}
          </div>
        ))}
      </dl>
      <p className="mt-8 text-sm">
        {text.vatPrivate} · {text.vatOrganisation}
      </p>
      <p className="mt-4 max-w-2xl text-pretty text-muted-foreground text-sm">
        {service.package.review}
        {service.startOffering && ` ${text.ending}`}
      </p>
      <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-6">
        {primary && (
          <Button asChild size="lg" className="h-12 px-6 text-base">
            <a href={primary.href}>{primary.label}</a>
          </Button>
        )}
        {service.memberOffering && (
          <ArrowLink href={`/book/${service.memberOffering}`} label={book.member} />
        )}
      </div>
    </SunPanel>
  )
}
