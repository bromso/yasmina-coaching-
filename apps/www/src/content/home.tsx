import { featureCopy, PLAN_KEYS, PLANS, type PlanKey } from "@repo/api-contract"
import { siteUrl } from "@repo/sites"
import type { Feature } from "@repo/ui/blocks/feature-grid"
import type { Logo } from "@repo/ui/blocks/logo-cloud"
import type { PricingTier } from "@repo/ui/blocks/pricing"
import type { Testimonial } from "@repo/ui/blocks/testimonials"
import { Icon } from "@repo/ui/components/icon"

/**
 * Every word on the landing page. Rename the product, rewrite the pitch or swap the tiers here;
 * `src/views/home-view.tsx` only arranges the blocks.
 */

/** A neutral text wordmark — placeholder company names, never a real brand's mark. */
const wordmark = (name: string) => (
  <svg viewBox="0 0 120 32" role="presentation" xmlns="http://www.w3.org/2000/svg">
    <text
      x="60"
      y="22"
      textAnchor="middle"
      fill="currentColor"
      fontFamily="ui-sans-serif, system-ui, sans-serif"
      fontSize="20"
      fontWeight="600"
      letterSpacing="-0.5"
    >
      {name}
    </text>
  </svg>
)

// Full `lucide:` names, so `bun icons:bundle` finds them when it scans the source.
const feature = (icon: string, title: string, description: string): Feature => ({
  icon: <Icon icon={icon} className="size-5" />,
  title,
  description,
})

/** A demo quote: shown with an "Example" label until you replace it with a real customer. */
export type DemoTestimonial = Testimonial & { placeholder?: boolean }

const signup = (plan: PlanKey) => `${siteUrl("auth")}/signup?plan=${plan}`

/** The marketing copy per plan — everything `PLANS` (the contract) doesn't own. */
const PLAN_COPY: Record<PlanKey, { description: string; extras: string[]; cta: string }> = {
  free: {
    description: "For side projects.",
    extras: ["Community support", "All core features"],
    cta: "Start for free",
  },
  pro: {
    description: "For a product with users.",
    extras: ["Email support", "Custom domain"],
    cta: "Start with Pro",
  },
  team: {
    description: "For teams shipping together.",
    extras: ["Everything in Pro", "Priority support"],
    cta: "Start with Team",
  },
}

const seatLine = (seatLimit: number | null) =>
  seatLimit === null ? "Unlimited members" : `Up to ${seatLimit} members`

/** The pricing block's tiers, derived from the contract's `PLANS` plus the www-side marketing copy. */
export function tiersFromPlans(): PricingTier[] {
  return PLAN_KEYS.map((key): PricingTier => {
    const plan = PLANS[key]
    const copy = PLAN_COPY[key]
    return {
      name: plan.name,
      price: `$${(plan.price.month / 100).toFixed(0)}`,
      period: key === "free" ? "/forever" : "/month",
      description: copy.description,
      features: [
        seatLine(plan.seatLimit),
        ...plan.features.map((f) => featureCopy(f).label),
        ...copy.extras,
      ],
      cta: { label: copy.cta, href: signup(key) },
      highlighted: key === "pro",
    }
  })
}

export const home = {
  hero: {
    eyebrow: "Frontend boilerplate",
    title: "Ship your product, not your plumbing",
    description:
      "Seven Next.js apps on their own subdomains, a typed Bun api, sign-in, email, CI and Docker — wired together and ready to rename.",
  },

  logos: {
    title: "Placeholder logos — replace them with your customers'",
    items: ["Acme", "Globex", "Initech", "Umbrella", "Hooli", "Vandelay"].map(
      (name): Logo => ({ name, node: wordmark(name) })
    ),
  },

  features: {
    heading: {
      eyebrow: "What's inside",
      title: "Everything a product needs on day one",
      description: "Each piece is small, tested and replaceable.",
    },
    items: [
      feature(
        "lucide:layers",
        "Subdomain apps",
        "Marketing, app, auth, account, docs, help and jobs — each its own Next.js app and origin."
      ),
      feature(
        "lucide:shield-check",
        "Auth and social sign-in",
        "Email and password, magic links and OAuth, with sessions shared across subdomains."
      ),
      feature(
        "lucide:mail",
        "Transactional email",
        "React Email templates behind one mailer seam: log in development, send in production."
      ),
      feature(
        "lucide:git-branch",
        "Typed api",
        "oRPC contract shared by server and clients, with OpenAPI docs and a forward-only migration set."
      ),
      feature(
        "lucide:container",
        "CI and Docker",
        "Affected-only CI, Storybook tests and one parameterised Dockerfile per runtime."
      ),
      feature(
        "lucide:sparkles",
        "AI service",
        "Streaming chat and structured endpoints on the AI SDK, with a keyless mock model."
      ),
    ],
  },

  testimonials: {
    heading: { eyebrow: "Testimonials", title: "What builders say" },
    items: [
      {
        quote: "We renamed it on Monday and had paying users by Friday.",
        name: "Ada Example",
        role: "Founder, Acme",
        avatar: { initials: "AE" },
        placeholder: true,
      },
      {
        quote: "The typed contract alone saved us a week of glue code.",
        name: "Grace Sample",
        role: "CTO, Globex",
        avatar: { initials: "GS" },
        placeholder: true,
      },
      {
        quote: "Finally a boilerplate whose CI is green out of the box.",
        name: "Linus Demo",
        role: "Engineer, Initech",
        avatar: { initials: "LD" },
        placeholder: true,
      },
    ] satisfies DemoTestimonial[],
  },

  pricing: {
    heading: {
      eyebrow: "Pricing",
      title: "Simple placeholder pricing",
      description: "Swap these tiers for your own — the block takes any number.",
    },
    tiers: tiersFromPlans(),
    note: "Prices are placeholders.",
  },

  faq: {
    heading: { eyebrow: "FAQ", title: "Questions, answered" },
    items: [
      {
        question: "What is included?",
        answer:
          "Seven Next.js apps, a Bun api with auth and a waitlist, an AI service, a shared UI package with Storybook, email templates, CI and Docker.",
      },
      {
        question: "How do I rename it?",
        answer:
          "Set SITE_DOMAIN for the hostnames, edit this page's content file for the copy, and change the brand name in the shared packages.",
      },
      {
        question: "How does sign-in work?",
        answer:
          "The api owns users and sessions; the auth app signs people in and sets one HttpOnly cookie on the parent domain that every app reads server-side.",
      },
      {
        question: "How do I deploy it?",
        answer:
          "Each app builds to its own Docker image, or deploys to its own Vercel project on its own subdomain.",
      },
      {
        question: "Can I remove apps I do not need?",
        answer:
          "Yes. Every app is an independent workspace: delete the folder, its sites entry and its Compose service.",
      },
      {
        question: "What is the licence?",
        answer:
          "The template ships without a licence file — add the one that fits your product before you publish it.",
      },
    ],
  },

  cta: {
    title: "Start building today",
    description: "Create an account and open the app in under a minute.",
    label: "Create an account",
    href: `${siteUrl("auth")}/signup`,
  },

  newsletter: {
    title: "Join the waitlist",
    description: "Hear when new features land. One email now, nothing else unless you opt in.",
  },
}
