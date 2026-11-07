"use client"

import { IMAGE_ACCEPT, MAX_IMAGE_BYTES } from "@repo/api-contract/files-limits"
import { Button } from "@repo/ui/components/button"
import { FieldError, FormMessage, fieldAria } from "@repo/ui/components/form-feedback"
import { useImageFallback } from "@repo/ui/components/image-fallback"
import { Label } from "@repo/ui/components/label"
import { cn } from "@repo/ui/lib/utils"
import { useTranslations } from "next-intl"
import { type ChangeEvent, useActionState, useEffect, useRef, useState } from "react"
import type { FormState } from "@/lib/actions"
import { resolveImageUploadView } from "@/lib/image-upload-view"

const initial: FormState = { ok: false }

type ImageUploadCardProps = {
  kind: "avatar" | "logo"
  /** The current image's URL, or null for none. */
  url: string | null
  /** Shown in place of the image when there is none. */
  fallback: string
  /** Required for `kind: "logo"` — carried as a hidden field so the server can re-check it. */
  workspaceId?: number
  /** Below admin: the image and `readOnlyNote` instead of forms. */
  readOnly?: boolean
  /** Shown next to the image when `readOnly`; ignored otherwise. */
  readOnlyNote?: string
  setAction: (state: FormState, formData: FormData) => Promise<FormState>
  removeAction: (state: FormState, formData: FormData) => Promise<FormState>
}

/**
 * The Profile-photo / Logo card: shows the current image or an initials fallback, a file input that
 * uploads on submit (and previews locally once JavaScript has hydrated), and a Remove form shown only
 * while there is an image. Both `useActionState` hooks sit above `readOnly`'s early return so a
 * `revalidatePath` triggered by either action can never unmount them mid-flight.
 */
export function ImageUploadCard({
  kind,
  url,
  fallback,
  workspaceId,
  readOnly = false,
  readOnlyNote,
  setAction,
  removeAction,
}: ImageUploadCardProps) {
  const t = useTranslations("account.image")
  const [setState, setFormAction, setPending] = useActionState(setAction, initial)
  const [removeState, removeFormAction, removePending] = useActionState(removeAction, initial)
  const [preview, setPreview] = useState<string | null>(null)
  const [clientError, setClientError] = useState<string>()
  const previewUrl = useRef<string | null>(null)

  // Revoke whatever object URL is current whenever a new one replaces it, and on unmount.
  useEffect(() => {
    return () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
    }
  }, [])

  // Every action result — an upload or a remove, ok or refused — ends the local preview: after a
  // success the page's `url` is the truth (the new image, or none after a remove), and after a
  // refusal the rejected file must not stay on screen as if it had been saved.
  const lastResults = useRef({ setState, removeState })
  useEffect(() => {
    const last = lastResults.current
    if (last.setState === setState && last.removeState === removeState) return
    lastResults.current = { setState, removeState }
    if (previewUrl.current) {
      URL.revokeObjectURL(previewUrl.current)
      previewUrl.current = null
    }
    setPreview(null)
  }, [setState, removeState])

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    if (previewUrl.current) {
      URL.revokeObjectURL(previewUrl.current)
      previewUrl.current = null
    }
    setPreview(null)
    setClientError(undefined)
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_IMAGE_BYTES) {
      // The same key as the server's own check (`checkImageFile`), in the page's language.
      setClientError(t("tooLarge"))
      return
    }
    const objectUrl = URL.createObjectURL(file)
    previewUrl.current = objectUrl
    setPreview(objectUrl)
  }

  const label = t(kind === "avatar" ? "profilePhoto" : "logo")
  const { shown, showRemove } = resolveImageUploadView({ url, preview })
  // Catches a stale `url` whose file has since been removed (a page rendered before the
  // removal), including a 404 fast enough to finish before hydration attaches `onError` — see
  // `useImageFallback`. A local `preview` (a fresh object URL from the file the browser just
  // picked) can't be stale this way, but running it through the same hook is harmless.
  const current = useImageFallback(shown)
  const imageClassName = cn(
    "size-16 shrink-0 object-cover",
    kind === "avatar" ? "rounded-full" : "rounded-md"
  )
  const fallbackClassName = cn(
    "bg-primary text-primary-foreground flex size-16 shrink-0 items-center justify-center text-lg font-medium select-none",
    kind === "avatar" ? "rounded-full" : "rounded-md"
  )

  const image =
    shown && !current.failed ? (
      // A locally chosen preview or an uploaded file served from this app's own origin — not a
      // next/image asset.
      <img
        ref={current.ref}
        src={shown}
        width={64}
        height={64}
        alt=""
        className={imageClassName}
        onError={current.onError}
      />
    ) : (
      <div className={fallbackClassName}>{fallback}</div>
    )

  if (readOnly) {
    return (
      <div className="flex items-center gap-4 px-6 py-5">
        {image}
        {readOnlyNote && <p className="text-muted-foreground text-sm">{readOnlyNote}</p>}
      </div>
    )
  }

  const aria = fieldAria("file", setState, `${kind}-file-hint`)
  const invalid = Boolean(clientError) || aria["aria-invalid"] === true
  const describedBy = clientError
    ? `${kind}-file-hint ${kind}-file-client-error`
    : aria["aria-describedby"]

  return (
    <div className="flex items-center gap-4 px-6 py-5">
      {image}
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <form action={setFormAction} className="flex flex-col gap-2">
          <FormMessage state={setState} />
          {kind === "logo" && <input type="hidden" name="workspaceId" value={workspaceId} />}
          <Label htmlFor={`${kind}-file`}>{label}</Label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id={`${kind}-file`}
              type="file"
              name="file"
              accept={IMAGE_ACCEPT}
              required
              onChange={onChange}
              aria-invalid={invalid ? true : undefined}
              aria-describedby={describedBy}
              className="text-sm"
            />
            <Button type="submit" disabled={setPending || Boolean(clientError)}>
              {t(setPending ? "uploading" : "upload")}
            </Button>
          </div>
          <p id={`${kind}-file-hint`} className="text-muted-foreground text-xs">
            {t("hint")}
          </p>
          {clientError ? (
            <p id={`${kind}-file-client-error`} className="text-destructive text-sm">
              {clientError}
            </p>
          ) : (
            <FieldError name="file" state={setState} />
          )}
        </form>
        {/*
          FormMessage always renders, even once `showRemove` (which follows `url`) has already gone
          false: a successful remove flips `url` to null in the same update that carries this
          message, so gating the message on `showRemove` the way the form/button below are gated
          would make "Profile photo removed." / "Logo removed." never appear — see
          lib/image-upload-view.ts.
        */}
        <FormMessage state={removeState} />
        {showRemove && (
          <form action={removeFormAction}>
            {kind === "logo" && <input type="hidden" name="workspaceId" value={workspaceId} />}
            <Button type="submit" variant="outline" size="sm" disabled={removePending}>
              {t(removePending ? "removing" : "remove")}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
