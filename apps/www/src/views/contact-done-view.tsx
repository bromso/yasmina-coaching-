import { leadNextStep } from "@repo/api-contract/leads"
import type { Locale } from "@repo/i18n/locales"
import { Button } from "@repo/ui/components/button"
import { ArrowLink } from "@/components/arrow-link"
import { StepIndicator } from "@/components/booking/step-indicator"
import { Eyebrow } from "@/components/eyebrow"
import { contactFor, EXPLORE_POSTS } from "@/content/contact"
import type { LeadAnswers } from "@/lib/leads"

type ContactDoneViewProps = {
  /** The lead's reference, shown as text; empty when the page was reached without one. */
  reference: string
  /** The three answers from the query, when all were known options; else no tailored step. */
  answers: LeadAnswers | null
  /** The blog's own URL, for the explore step's two posts. */
  blogUrl: string
  locale: Locale
}

/**
 * The contact form's fourth step: the reference, the next step chosen from the visitor's answers
 * (`leadNextStep`, the same rule as their confirmation mail) and what happens now.
 */
export function ContactDoneView({ reference, answers, blogUrl, locale }: ContactDoneViewProps) {
  const copy = contactFor(locale)
  const steps = copy.form.steps
  const next = answers ? leadNextStep(answers) : null
  const step = next ? copy.done.next[next.kind] : null
  return (
    <main id="main">
      <section aria-labelledby="done-title" className="container max-w-3xl py-16 lg:py-24">
        <div className="rounded-4xl bg-linear-to-b from-sun-soft via-sun to-sun px-6 py-12 sm:px-10 lg:px-14 lg:py-16">
          <StepIndicator
            steps={steps}
            stepOf={copy.form.stepOf}
            doneLabel={copy.form.stepper.done}
            current={steps.length}
            className="mb-8"
          />
          <Eyebrow>{copy.done.eyebrow}</Eyebrow>
          <h1 id="done-title" className="mt-5 scroll-mt-24 text-balance text-4xl sm:text-5xl">
            {copy.done.title}
          </h1>
          <p className="mt-6 text-pretty text-lg text-muted-foreground">{copy.done.body}</p>
          {reference && (
            <dl className="mt-8 grid gap-1">
              <dt className="text-muted-foreground text-sm">{copy.done.reference}</dt>
              <dd className="font-display text-3xl">{reference}</dd>
            </dl>
          )}
          {next && step && (
            <section
              aria-labelledby="next-step-title"
              className="mt-10 grid gap-4 rounded-3xl bg-background/80 p-6 sm:p-8"
            >
              <h2 id="next-step-title" className="font-display text-2xl">
                {step.title}
              </h2>
              <p className="text-pretty">{step.body}</p>
              {next.kind === "explore" ? (
                <>
                  <h3 className="mt-2 font-medium">{copy.done.readHeading}</h3>
                  <ul className="grid gap-2">
                    {EXPLORE_POSTS[locale].map((post) => (
                      <li key={post.slug}>
                        <a
                          href={`${blogUrl}/${post.slug}`}
                          className="underline underline-offset-4 hover:text-muted-foreground"
                        >
                          {post.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                  <ArrowLink href={next.path} label={step.cta} className="mt-2" />
                </>
              ) : (
                <Button asChild size="lg" className="h-12 w-fit rounded-full px-6 text-base">
                  <a href={next.path}>{step.cta}</a>
                </Button>
              )}
            </section>
          )}
          <h2 className="mt-12 font-display text-2xl">{copy.done.whatNow.heading}</h2>
          <ol className="mt-4 grid gap-3">
            {copy.done.whatNow.items.map((item, i) => (
              <li key={item} className="flex gap-4">
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full border border-foreground/20 font-display text-sm"
                >
                  {i + 1}
                </span>
                <span className="pt-1 text-pretty">{item}</span>
              </li>
            ))}
          </ol>
          <Button
            asChild
            variant="outline"
            className="mt-12 min-h-11 rounded-full bg-background/70 px-6"
          >
            <a href="/">{copy.done.home}</a>
          </Button>
        </div>
      </section>
    </main>
  )
}
