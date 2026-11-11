import { Eyebrow } from "@repo/ui/components/eyebrow"
import { Reveal, RevealItem } from "@repo/ui/components/motion/reveal"
import type { HomeContent } from "@/content/home"
import type { MediaText } from "@/content/media"

type CredentialsSectionProps = HomeContent["credentials"] & {
  /** The two column headings. */
  labels: MediaText["credentials"]
}

/** The CV, two columns: roles newest first, then the training behind them. */
export function CredentialsSection({
  heading,
  experience,
  education,
  labels,
}: CredentialsSectionProps) {
  return (
    <section aria-labelledby="credentials-title" className="border-border border-t py-24 lg:py-32">
      <div className="container grid gap-12 lg:grid-cols-12">
        <Reveal className="lg:col-span-4">
          <Eyebrow>{heading.eyebrow}</Eyebrow>
          <h2 id="credentials-title" className="mt-5 text-balance text-4xl sm:text-5xl">
            {heading.title}
          </h2>
        </Reveal>
        <div className="grid gap-12 lg:col-span-8 lg:grid-cols-5 lg:gap-10">
          <div className="lg:col-span-3">
            <Eyebrow as="h3">{labels.experience}</Eyebrow>
            <Reveal as="ol" stagger={60} className="mt-4 divide-y divide-border">
              {experience.map((role, i) => (
                <RevealItem
                  key={`${role.period}${role.title}`}
                  as="li"
                  index={i}
                  className="grid gap-1 py-4 sm:grid-cols-[7.5rem_1fr] sm:gap-4"
                >
                  <span className="font-mono text-muted-foreground text-xs tabular-nums sm:pt-1">
                    {role.period}
                  </span>
                  <div>
                    <div className="font-medium">{role.title}</div>
                    <div className="text-muted-foreground text-sm">{role.place}</div>
                    {role.detail && (
                      <div className="mt-1 text-muted-foreground text-sm">{role.detail}</div>
                    )}
                  </div>
                </RevealItem>
              ))}
            </Reveal>
          </div>
          <div className="lg:col-span-2">
            <Eyebrow as="h3">{labels.training}</Eyebrow>
            <Reveal as="ul" stagger={60} className="mt-4 divide-y divide-border">
              {education.map((item, i) => (
                <RevealItem key={item.title} as="li" index={i} className="py-4">
                  <div className="font-medium">{item.title}</div>
                  {item.place ? (
                    <div className="text-muted-foreground text-sm">{item.place}</div>
                  ) : null}
                </RevealItem>
              ))}
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  )
}
