import { createSecurityProxy } from "@repo/ui/lib/security-proxy"

export const proxy = createSecurityProxy()

// Skip Next's own assets and static files; the policy is for documents and API routes.
// Next reads the matcher statically, so it is a literal here rather than a shared constant.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|js|css|map|txt|webmanifest)$).*)",
  ],
}
