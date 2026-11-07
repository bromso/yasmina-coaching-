"use client"

import { useChat } from "@ai-sdk/react"
import type { ChatMessage } from "@repo/ai-contract"
import { Alert, AlertDescription } from "@repo/ui/components/alert"
import { Button } from "@repo/ui/components/button"
import { Input } from "@repo/ui/components/input"
import { APICallError, DefaultChatTransport } from "ai"
import { useTranslations } from "next-intl"
import { type FormEvent, useState } from "react"

const transport = new DefaultChatTransport<ChatMessage>({ api: "/api/chat" })

/**
 * /api/chat answers errors as `{ message }` (the plan gate's already in the reader's language);
 * show that message rather than the raw body, else `fallback`.
 */
function errorMessage(error: Error, fallback: string): string {
  if (APICallError.isInstance(error) && error.responseBody) {
    try {
      const body = JSON.parse(error.responseBody) as { message?: unknown }
      if (typeof body.message === "string") return body.message
    } catch {
      // Not JSON: fall through to the generic message.
    }
  }
  return fallback
}

export function ChatView() {
  const t = useTranslations("app.chat")
  const { messages, sendMessage, status, error, regenerate } = useChat<ChatMessage>({ transport })
  const [input, setInput] = useState("")
  const busy = status === "submitted" || status === "streaming"
  // Screen readers hear each finished reply once, not the whole list again on every token.
  const lastReply = messages.at(-1)
  const announcement =
    status === "ready" && lastReply?.role === "assistant"
      ? lastReply.parts.map((part) => (part.type === "text" ? part.text : "")).join("")
      : ""

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = input.trim()
    if (!text || busy) return
    sendMessage({ text })
    setInput("")
  }

  return (
    <main id="main" className="mx-auto grid w-full max-w-2xl gap-6 px-6 py-16">
      <header className="grid gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </header>

      <ol className="grid gap-3">
        {messages.map((message) => (
          <li
            key={message.id}
            className={
              message.role === "user"
                ? "justify-self-end rounded-lg bg-primary px-4 py-2 text-primary-foreground"
                : "justify-self-start rounded-lg bg-muted px-4 py-2"
            }
          >
            <span className="sr-only">{t(message.role === "user" ? "you" : "assistant")}</span>
            {message.parts.map((part, index) => {
              const key = `${message.id}-${index}`
              if (part.type === "text") {
                return (
                  <p key={key} className="whitespace-pre-wrap">
                    {part.text}
                  </p>
                )
              }
              if (part.type === "tool-getCurrentTime") {
                return (
                  <p key={key} className="text-sm text-muted-foreground">
                    {part.state === "output-available"
                      ? t("time", { time: part.output.formatted, zone: part.output.timeZone })
                      : t(part.state === "output-error" ? "timeError" : "timeChecking")}
                  </p>
                )
              }
              return null
            })}
          </li>
        ))}
      </ol>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      {error && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between gap-4">
            {errorMessage(error, t("error"))}
            <Button type="button" size="sm" variant="outline" onClick={() => regenerate()}>
              {t("retry")}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={onSubmit} className="flex gap-2">
        <Input
          aria-label={t("message")}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={t("placeholder")}
          disabled={busy}
        />
        <Button type="submit" disabled={busy || !input.trim()}>
          {t("send")}
        </Button>
      </form>
    </main>
  )
}
