import type { ProviderId } from "@repo/api-contract"
import { Button } from "@repo/ui/components/button"
import { Icon } from "@repo/ui/components/icon"
import { useTranslations } from "next-intl"
import { PROVIDER_LABELS } from "@/lib/providers"

/**
 * One link per provider the api has configured, to `/oauth/<provider>/start`. Plain links, not
 * buttons in the form: the start route sets the state cookie and redirects to the provider.
 * The `simple-icons:*` glyphs are not in the offline lucide bundle; Iconify fetches them from its API.
 */
export function SocialButtons({
  providers,
  intent,
  next,
  reauth = false,
}: {
  providers: ProviderId[]
  /** Which sentence each button reads: "Login with GitHub" or "Sign up with GitHub". */
  intent: "login" | "signup"
  next?: string
  /** The sign-in form's "sign in again" mode: the start route signs in afresh, never connects. */
  reauth?: boolean
}) {
  const t = useTranslations("auth.social")
  if (providers.length === 0) return null
  const params = new URLSearchParams()
  if (next) params.set("next", next)
  if (reauth) params.set("reauth", "1")
  const qs = params.toString()
  const query = qs ? `?${qs}` : ""
  return (
    <div className="flex flex-col gap-4">
      {providers.map((p) => (
        <Button key={p} asChild variant="outline" className="w-full">
          <a href={`/oauth/${p}/start${query}`}>
            <Icon icon={`simple-icons:${p}`} className="size-4" aria-hidden />
            {t(intent, { provider: PROVIDER_LABELS[p] })}
          </a>
        </Button>
      ))}
    </div>
  )
}

/** The "or" rule between two ways to sign in; the caller passes the text, in its language. */
export function OrDivider({ label }: { label: string }) {
  return (
    <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-border after:border-t">
      <span className="relative z-10 bg-card px-2 text-muted-foreground">{label}</span>
    </div>
  )
}
