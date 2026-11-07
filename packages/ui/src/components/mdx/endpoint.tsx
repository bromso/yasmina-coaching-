import type { ReactElement } from "react"

export type EndpointProps = {
  /** The HTTP method: `GET`, `POST`, `DELETE`, … (shown upper-case). */
  method: string
  /** The route's path, with its parameters in braces: `/v1/notes/{id}`. */
  path: string
  /** The API key scope the route requires, when it requires one. */
  scope?: string
}

/**
 * An API route's method, path and required scope, for API reference pages written in MDX:
 * `<Endpoint method="POST" path="/v1/notes" scope="notes:write" />`. The method is a text badge
 * (never colour alone) with a visually hidden "Method:" label, so a screen reader announces
 * "Method: POST /v1/notes". A pure component, so it is in both `mdxComponents` and
 * `mdxStaticComponents`.
 */
export function Endpoint({ method, path, scope }: EndpointProps): ReactElement {
  return (
    <div
      data-slot="endpoint"
      className="my-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-muted/50 px-4 py-3 text-sm"
    >
      <span className="rounded-md border bg-background px-2 py-0.5 font-mono text-xs font-semibold tracking-wide">
        <span className="sr-only">Method: </span>
        {method.toUpperCase()}
      </span>
      <code className="font-mono break-all">{path}</code>
      {scope && (
        <span className="text-muted-foreground sm:ms-auto">
          Required scope:{" "}
          <code className="rounded bg-background px-1 py-0.5 font-mono text-foreground">
            {scope}
          </code>
        </span>
      )}
    </div>
  )
}
