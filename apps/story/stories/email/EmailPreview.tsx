import type { RenderedEmail } from "@repo/email"
import { useEffect, useState } from "react"

/** Renders a template's HTML in a sandboxed iframe, with the subject and plain text beside it. */
export function EmailPreview({ render }: { render: () => Promise<RenderedEmail> }) {
  const [mail, setMail] = useState<RenderedEmail | null>(null)
  useEffect(() => {
    let live = true
    render().then((m) => live && setMail(m))
    return () => {
      live = false
    }
  }, [render])
  if (!mail) return <p>Rendering…</p>
  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 720 }}>
      <p>
        <strong>Subject:</strong> <span data-testid="subject">{mail.subject}</span>
      </p>
      <iframe
        title="Email preview"
        srcDoc={mail.html}
        sandbox=""
        style={{ width: "100%", height: 560, border: "1px solid #e5e7eb" }}
      />
      <details>
        <summary>Plain text</summary>
        <pre data-testid="text" style={{ whiteSpace: "pre-wrap" }}>
          {mail.text}
        </pre>
      </details>
    </div>
  )
}
