import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card"
import type { ReactNode } from "react"

export type ContactViewProps = {
  /** The form itself (the page passes `<ContactForm />`): a slot, so the view holds no client
   * component or router — mirrors `HomeView`'s `search` prop. */
  form: ReactNode
}

/** `/contact`: a heading and the contact form, in a single card. */
export function ContactView({ form }: ContactViewProps) {
  return (
    <main id="main" className="container flex max-w-2xl flex-col gap-8 py-16">
      <header className="flex flex-col gap-3">
        <h1 className="font-semibold text-4xl tracking-tight">Contact support</h1>
        <p className="text-lg text-muted-foreground">
          Can't find what you're looking for? Send us a message and we'll get back to you.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle className="sr-only">Contact support</CardTitle>
        </CardHeader>
        <CardContent>{form}</CardContent>
      </Card>
    </main>
  )
}
