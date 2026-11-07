import { siteUrl } from "@repo/sites"
import type { Metadata } from "next"
import { ContactForm } from "@/components/contact-form"
import { ContactView } from "@/views/contact-view"

export const metadata: Metadata = {
  title: "Contact support",
  description: "Send a message to support and we'll get back to you.",
  alternates: { canonical: `${siteUrl("help")}/contact` },
}

export default function Page() {
  return <ContactView form={<ContactForm />} />
}
