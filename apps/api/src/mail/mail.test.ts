import { describe, expect, test } from "bun:test"
import { mkdtempSync, readdirSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createLogger } from "@repo/log"
import { createMailer } from "./create-mailer"
import { fileMailer } from "./file"
import { logMailer } from "./log"
import { maskEmail } from "./mailer"
import { resendMailer } from "./resend"
import { smtpMailer } from "./smtp"

const message = { to: "ada@example.com", subject: "Hi", html: "<p>Hi</p>", text: "Hi" }
// What an optional notification mail carries (RFC 8058); every other mail carries no headers.
const unsubscribe = {
  "List-Unsubscribe": "<https://auth.example.com/email/unsubscribe/one-click?token=abc.def>",
  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
}

describe("resendMailer", () => {
  test("posts the message with the bearer token and idempotency key", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    const fetch = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} })
      return new Response(JSON.stringify({ id: "m_1" }), { status: 200 })
    }
    const mailer = resendMailer({ apiKey: "re_test", from: "Boilerplate <no-reply@x.test>", fetch })
    await mailer.send({ ...message, idempotencyKey: "verify:1:abc" })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe("https://api.resend.com/emails")
    const headers = new Headers(calls[0]?.init.headers)
    expect(headers.get("authorization")).toBe("Bearer re_test")
    expect(headers.get("idempotency-key")).toBe("verify:1:abc")
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      from: "Boilerplate <no-reply@x.test>",
      to: "ada@example.com",
      subject: "Hi",
      html: "<p>Hi</p>",
      text: "Hi",
    })
  })

  test("sends replyTo as reply_to, and omits it entirely when absent", async () => {
    const calls: Array<{ init: RequestInit }> = []
    const fetch = async (_url: string | URL | Request, init?: RequestInit) => {
      calls.push({ init: init ?? {} })
      return new Response(JSON.stringify({ id: "m_1" }), { status: 200 })
    }
    const mailer = resendMailer({ apiKey: "re_test", from: "a@x.test", fetch })
    await mailer.send({ ...message, replyTo: "ada@example.com" })
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      reply_to: "ada@example.com",
    })

    await mailer.send(message)
    expect(JSON.parse(String(calls[1]?.init.body))).not.toHaveProperty("reply_to")
  })

  test("sends headers as Resend's headers field, and omits it entirely when absent", async () => {
    const calls: Array<{ init: RequestInit }> = []
    const fetch = async (_url: string | URL | Request, init?: RequestInit) => {
      calls.push({ init: init ?? {} })
      return new Response(JSON.stringify({ id: "m_1" }), { status: 200 })
    }
    const mailer = resendMailer({ apiKey: "re_test", from: "a@x.test", fetch })
    await mailer.send({ ...message, headers: unsubscribe })
    expect(JSON.parse(String(calls[0]?.init.body)).headers).toEqual(unsubscribe)
    // Message headers never leak into the HTTP request's own headers.
    expect(new Headers(calls[0]?.init.headers).get("list-unsubscribe")).toBeNull()

    await mailer.send(message)
    expect(JSON.parse(String(calls[1]?.init.body))).not.toHaveProperty("headers")
  })

  test("a non-2xx response throws with the status and body", async () => {
    const fetch = async () => new Response('{"message":"invalid"}', { status: 422 })
    const mailer = resendMailer({ apiKey: "re_test", from: "a@x.test", fetch })
    await expect(mailer.send(message)).rejects.toThrow(/resend 422: .*invalid/)
  })

  test("a request that never answers is aborted after timeoutMs", async () => {
    // Resolves only when the adapter's signal aborts, like a black-holed host.
    const fetch = (_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason))
      })
    const mailer = resendMailer({ apiKey: "re_test", from: "a@x.test", fetch, timeoutMs: 20 })
    const error = await mailer.send(message).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(DOMException)
    expect(["TimeoutError", "AbortError"]).toContain((error as DOMException).name)
  })
})

describe("smtpMailer", () => {
  test("hands the message to the transport with the configured sender", async () => {
    const mailer = smtpMailer({
      url: "smtp://user:pass@localhost:2525",
      from: "a@x.test",
      jsonTransport: true,
    })
    const info = await mailer.sendRaw(message)
    const parsed = JSON.parse(info.message as string)
    expect(parsed.from.address).toBe("a@x.test")
    expect(parsed.to[0].address).toBe("ada@example.com")
    expect(parsed.html).toBe("<p>Hi</p>")
  })

  test("sends replyTo as the envelope's reply-to, and omits it entirely when absent", async () => {
    const mailer = smtpMailer({
      url: "smtp://user:pass@localhost:2525",
      from: "a@x.test",
      jsonTransport: true,
    })
    const withReplyTo = await mailer.sendRaw({ ...message, replyTo: "ada@example.com" })
    const parsedWithReplyTo = JSON.parse(withReplyTo.message as string)
    expect(parsedWithReplyTo.replyTo[0].address).toBe("ada@example.com")

    const withoutReplyTo = await mailer.sendRaw(message)
    const parsedWithoutReplyTo = JSON.parse(withoutReplyTo.message as string)
    expect(parsedWithoutReplyTo.replyTo).toBeUndefined()
  })
})

describe("smtpMailer headers", () => {
  test("passes headers to Nodemailer's headers, and adds none when absent", async () => {
    const mailer = smtpMailer({
      url: "smtp://user:pass@localhost:2525",
      from: "a@x.test",
      jsonTransport: true,
    })
    const withHeaders = JSON.parse(
      (await mailer.sendRaw({ ...message, headers: unsubscribe })).message as string
    )
    expect(withHeaders.headers).toEqual(unsubscribe)
    const without = JSON.parse((await mailer.sendRaw(message)).message as string)
    expect(without.headers ?? {}).toEqual({})
  })
})

describe("createMailer", () => {
  test("log is the default", () => {
    expect(createMailer({ MAIL_PROVIDER: "log", MAIL_FROM: "a@x.test" }).kind).toBe("log")
  })
  test("smtp needs SMTP_URL", () => {
    expect(() => createMailer({ MAIL_PROVIDER: "smtp", MAIL_FROM: "a@x.test" })).toThrow(/SMTP_URL/)
    expect(
      createMailer({ MAIL_PROVIDER: "smtp", MAIL_FROM: "a@x.test", SMTP_URL: "smtp://h:25" }).kind
    ).toBe("smtp")
  })
  test("resend needs RESEND_API_KEY", () => {
    expect(() => createMailer({ MAIL_PROVIDER: "resend", MAIL_FROM: "a@x.test" })).toThrow(
      /RESEND_API_KEY/
    )
  })
  test("file needs MAIL_DIR", () => {
    const dir = mkdtempSync(join(tmpdir(), "mail-"))
    expect(() => createMailer({ MAIL_PROVIDER: "file", MAIL_FROM: "x" })).toThrow(
      "MAIL_PROVIDER=file needs MAIL_DIR"
    )
    expect(createMailer({ MAIL_PROVIDER: "file", MAIL_FROM: "x", MAIL_DIR: dir }).kind).toBe("file")
  })
})

test("logMailer writes one structured line: masked addresses, subject and the text body", async () => {
  const lines: string[] = []
  const logger = createLogger({ service: "api", format: "json", write: (l) => lines.push(l) })
  const mailer = logMailer(logger)
  await mailer.send({ ...message, replyTo: "ada@example.com" })
  await mailer.send(message)
  expect(lines).toHaveLength(2)
  const [withReply, plain] = lines.map((l) => JSON.parse(l))
  expect(withReply).toMatchObject({
    level: "info",
    service: "api",
    message: "mail",
    to: maskEmail(message.to),
    replyTo: "a***@example.com",
    subject: message.subject,
    text: message.text,
  })
  expect(plain.replyTo).toBeUndefined()
  expect(plain.headers).toBeUndefined()
  expect(lines[0]).not.toContain("[api]")
})

test("logMailer records the headers when a message carries them", async () => {
  const lines: string[] = []
  const logger = createLogger({ service: "api", format: "json", write: (l) => lines.push(l) })
  await logMailer(logger).send({ ...message, headers: unsubscribe })
  expect(JSON.parse(lines[0] ?? "{}").headers).toEqual(unsubscribe)
})

test("fileMailer writes the headers when given, and omits them when absent", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mail-"))
  const mailer = fileMailer(dir)
  await mailer.send({ ...message, headers: unsubscribe })
  const [first] = readdirSync(dir)
  expect(JSON.parse(readFileSync(join(dir, first ?? ""), "utf8")).headers).toEqual(unsubscribe)
  await mailer.send(message)
  const second = readdirSync(dir).find((f) => f !== first)
  expect(JSON.parse(readFileSync(join(dir, second ?? ""), "utf8"))).not.toHaveProperty("headers")
})

test("maskEmail keeps the first character and the domain", () => {
  expect(maskEmail("ada@example.com")).toBe("a***@example.com")
  expect(maskEmail("x")).toBe("***")
})

test("fileMailer writes one JSON file per message, creating the directory", async () => {
  const dir = join(mkdtempSync(join(tmpdir(), "mail-")), "nested")
  const mailer = fileMailer(dir)
  expect(mailer.kind).toBe("file")
  await mailer.send({ to: "a@example.com", subject: "Hi", text: "t https://x/y", html: "<p>t</p>" })
  const files = readdirSync(dir)
  expect(files).toHaveLength(1)
  expect(files[0]).toMatch(/^\d+-[0-9a-f]{6}\.json$/)
  const mail = JSON.parse(readFileSync(join(dir, files[0] ?? ""), "utf8"))
  expect(mail).toMatchObject({
    to: "a@example.com",
    subject: "Hi",
    text: "t https://x/y",
    html: "<p>t</p>",
  })
  expect(Date.parse(mail.sentAt)).not.toBeNaN()
})

test("fileMailer writes the reply-to address when given, and omits it when absent", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mail-"))
  const mailer = fileMailer(dir)
  await mailer.send({
    to: "a@example.com",
    subject: "Hi",
    text: "t",
    html: "<p>t</p>",
    replyTo: "ada@example.com",
  })
  const [withReplyToFile] = readdirSync(dir)
  const withReplyTo = JSON.parse(readFileSync(join(dir, withReplyToFile ?? ""), "utf8"))
  expect(withReplyTo.replyTo).toBe("ada@example.com")

  await mailer.send({ to: "a@example.com", subject: "Hi", text: "t", html: "<p>t</p>" })
  const files = readdirSync(dir).filter((f) => f !== withReplyToFile)
  const withoutReplyTo = JSON.parse(readFileSync(join(dir, files[0] ?? ""), "utf8"))
  expect(withoutReplyTo).not.toHaveProperty("replyTo")
})
