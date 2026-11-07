import { Button } from "@repo/ui/components/button"
import type { ComponentProps } from "react"

type SignInLinkProps = Omit<ComponentProps<typeof Button>, "asChild" | "children"> & {
  /** Origin of the auth app, e.g. `https://auth.brand.com`. */
  authUrl: string
  /** Where to return after signing in. */
  next?: string
  /** The link's text, in the page's language. */
  label?: string
}

/** "Sign in" link to the auth app's login page, carrying an optional return URL. */
export function SignInLink({
  authUrl,
  next,
  label = "Sign in",
  variant = "outline",
  size = "sm",
  ...buttonProps
}: SignInLinkProps) {
  const href = next ? `${authUrl}/login?next=${encodeURIComponent(next)}` : `${authUrl}/login`
  return (
    <Button asChild variant={variant} size={size} {...buttonProps}>
      <a href={href}>{label}</a>
    </Button>
  )
}
