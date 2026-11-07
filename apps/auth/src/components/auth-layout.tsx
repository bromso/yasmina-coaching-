import type { ReactNode } from "react"

/**
 * Centered shell for all auth screens (design from shadcn/ui login-03):
 * a narrow column on a muted backdrop, between the site header and footer.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main
      id="main"
      className="flex flex-1 flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10"
    >
      <div className="flex w-full max-w-sm flex-col gap-6">{children}</div>
    </main>
  )
}
