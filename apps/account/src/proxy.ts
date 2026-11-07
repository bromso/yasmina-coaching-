import { createSecurityProxy } from "@repo/ui/lib/security-proxy"

// The Payments actions answer a plain form POST with a redirect to Stripe Checkout or the billing
// portal; `form-action` also governs where that redirect may go, so without JavaScript the browser
// would block it.
export const proxy = createSecurityProxy({
  csp: { "form-action": ["https://checkout.stripe.com", "https://billing.stripe.com"] },
})

// Skip Next's own assets and static files; the policy is for documents and API routes.
// Next reads the matcher statically, so it is a literal here rather than a shared constant.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|js|css|map|txt|webmanifest)$).*)",
  ],
}
