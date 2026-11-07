import { describe, expect, test } from "bun:test"
import { ORPCError } from "@orpc/client"
import { STORAGE_UNAVAILABLE_MESSAGE } from "@repo/api-contract"
import { CV_UPLOAD_MESSAGE, MAX_CV_BYTES } from "@repo/api-contract/jobs"
import { applyHeaders } from "./api"
import {
  type ApplyApi,
  applicationSentMessage,
  CONSENT_MESSAGE,
  HONEYPOT_MESSAGE,
  JOB_CLOSED_MESSAGE,
  resolveApplyLocale,
  submitApplicationCore,
  TOO_MANY_REQUESTS,
  UNAVAILABLE,
} from "./apply"
import type { Job } from "./jobs-core"

function job(overrides: Partial<Job> = {}): Job {
  return {
    slug: "senior-fullstack-engineer",
    path: "/senior-fullstack-engineer",
    title: "Senior Full-stack Engineer",
    description: "Build the product end to end.",
    team: "Engineering",
    location: "Remote (US)",
    employment: "full-time",
    posted: "2026-09-15",
    status: "open",
    open: true,
    ...overrides,
  }
}

const openJobs = [job()]

function pdf(size = 1024): File {
  return new File([new Uint8Array(size)], "cv.pdf", { type: "application/pdf" })
}

function fd(fields: Record<string, string | File> = {}): FormData {
  const f = new FormData()
  f.set("job", "senior-fullstack-engineer")
  f.set("name", "Ada Lovelace")
  f.set("email", "ada@example.com")
  f.set("cv", pdf())
  f.set("consent", "yes")
  for (const [key, value] of Object.entries(fields)) f.set(key, value)
  return f
}

describe("submitApplicationCore", () => {
  test("success: the reference comes back, the message carries name, role and email", async () => {
    const api: ApplyApi = { apply: async () => ({ reference: "JOB-1" }) }
    const out = await submitApplicationCore({ api: async () => api, openJobs }, fd())
    expect(out).toEqual({
      ok: true,
      message: applicationSentMessage(
        "Ada Lovelace",
        "Senior Full-stack Engineer",
        "ada@example.com"
      ),
      reference: "JOB-1",
    })
  })

  test("a filled honeypot answers success with no api call, and no fake reference", async () => {
    let calls = 0
    const api: ApplyApi = {
      apply: async () => {
        calls++
        return { reference: "JOB-2" }
      },
    }
    const out = await submitApplicationCore(
      { api: async () => api, openJobs },
      fd({ hp_field: "http://spam.example" })
    )
    expect(out).toEqual({ ok: true, message: HONEYPOT_MESSAGE })
    expect(calls).toBe(0)
  })

  test("a slug that is not an open posting is a field error without calling the api", async () => {
    let calls = 0
    const api: ApplyApi = {
      apply: async () => {
        calls++
        return { reference: "JOB-3" }
      },
    }
    const out = await submitApplicationCore(
      { api: async () => api, openJobs },
      fd({ job: "closed-role" })
    )
    expect(out).toEqual({ ok: false, fieldErrors: { job: JOB_CLOSED_MESSAGE } })
    expect(calls).toBe(0)
  })

  test("the title sent to the api comes from the build, never the form", async () => {
    let sentTitle: string | undefined
    const api: ApplyApi = {
      apply: async (input) => {
        sentTitle = input.title
        return { reference: "JOB-4" }
      },
    }
    await submitApplicationCore({ api: async () => api, openJobs }, fd({ title: "Made-up title" }))
    expect(sentTitle).toBe("Senior Full-stack Engineer")
  })

  test("a missing CV is the cv field error without calling the api", async () => {
    let calls = 0
    const api: ApplyApi = {
      apply: async () => {
        calls++
        return { reference: "JOB-5" }
      },
    }
    const f = fd()
    f.delete("cv")
    const out = await submitApplicationCore({ api: async () => api, openJobs }, f)
    expect(out).toMatchObject({ ok: false, fieldErrors: { cv: CV_UPLOAD_MESSAGE } })
    expect(calls).toBe(0)
  })

  test("a CV over MAX_CV_BYTES is the cv field error without calling the api", async () => {
    let calls = 0
    const api: ApplyApi = {
      apply: async () => {
        calls++
        return { reference: "JOB-6" }
      },
    }
    const out = await submitApplicationCore(
      { api: async () => api, openJobs },
      fd({ cv: pdf(MAX_CV_BYTES + 1) })
    )
    expect(out).toMatchObject({ ok: false, fieldErrors: { cv: CV_UPLOAD_MESSAGE } })
    expect(calls).toBe(0)
  })

  test("an unchecked consent box is a field error without calling the api", async () => {
    let calls = 0
    const api: ApplyApi = {
      apply: async () => {
        calls++
        return { reference: "JOB-7" }
      },
    }
    const f = fd()
    f.delete("consent")
    const out = await submitApplicationCore({ api: async () => api, openJobs }, f)
    expect(out).toMatchObject({ ok: false, fieldErrors: { consent: CONSENT_MESSAGE } })
    expect(calls).toBe(0)
  })

  test("an invalid email is a field error without calling the api", async () => {
    let calls = 0
    const api: ApplyApi = {
      apply: async () => {
        calls++
        return { reference: "JOB-8" }
      },
    }
    const out = await submitApplicationCore(
      { api: async () => api, openJobs },
      fd({ email: "nope" })
    )
    expect(out).toMatchObject({ ok: false, fieldErrors: { email: expect.any(String) } })
    expect(calls).toBe(0)
  })

  test("a non-https link is dropped (applicationLink's own rule), not a reason to refuse", async () => {
    let sentLink: string | undefined
    const api: ApplyApi = {
      apply: async (input) => {
        sentLink = input.link
        return { reference: "JOB-9" }
      },
    }
    const out = await submitApplicationCore(
      { api: async () => api, openJobs },
      fd({ link: "ftp://not-https.example" })
    )
    expect(out.ok).toBe(true)
    expect(sentLink).toBeUndefined()
  })

  test("a valid https link reaches the api untouched", async () => {
    let sentLink: string | undefined
    const api: ApplyApi = {
      apply: async (input) => {
        sentLink = input.link
        return { reference: "JOB-10" }
      },
    }
    await submitApplicationCore(
      { api: async () => api, openJobs },
      fd({ link: "https://example.com/ada" })
    )
    expect(sentLink).toBe("https://example.com/ada")
  })

  test("the api client factory receives the ip and locale", async () => {
    const api: ApplyApi = { apply: async () => ({ reference: "JOB-11" }) }
    let received: [string | undefined, string | undefined] | undefined
    await submitApplicationCore(
      {
        api: async (ip, locale) => {
          received = [ip, locale]
          return api
        },
        ip: "203.0.113.9",
        locale: "sv",
        openJobs,
      },
      fd()
    )
    expect(received).toEqual(["203.0.113.9", "sv"])
  })

  test("the api client failing to build (e.g. no env configured) answers unavailable", async () => {
    const out = await submitApplicationCore(
      {
        api: async () => {
          throw new Error("API_URL is not set")
        },
        openJobs,
      },
      fd()
    )
    expect(out).toMatchObject({ ok: false, message: UNAVAILABLE })
  })

  test("TOO_MANY_REQUESTS maps to the page's own English constant, not the live error message", async () => {
    const limited = new ORPCError("TOO_MANY_REQUESTS", {
      defined: true,
      message: "För många ansökningar, försök igen senare",
    })
    const api: ApplyApi = {
      apply: async () => {
        throw limited
      },
    }
    const out = await submitApplicationCore({ api: async () => api, openJobs }, fd())
    expect(out).toMatchObject({ ok: false, message: TOO_MANY_REQUESTS })
  })

  test("a BAD_REQUEST from the api maps to the page's own English constant, not the live error message", async () => {
    // The api may answer in whatever locale was sent (x-locale); this page never translates, so
    // it must show its own text rather than trust the error's — same reasoning as the
    // TOO_MANY_REQUESTS case above.
    const badRequest = new ORPCError("BAD_REQUEST", {
      defined: true,
      message: "Ladda upp ditt CV som en PDF på högst 5 MB.",
    })
    const api: ApplyApi = {
      apply: async () => {
        throw badRequest
      },
    }
    const out = await submitApplicationCore({ api: async () => api, openJobs }, fd())
    expect(out).toMatchObject({ ok: false, fieldErrors: { cv: CV_UPLOAD_MESSAGE } })
  })

  test("a SERVICE_UNAVAILABLE from the api maps to the page's own English constant, not the live error message", async () => {
    // Same reasoning as BAD_REQUEST and TOO_MANY_REQUESTS above.
    const unavailable = new ORPCError("SERVICE_UNAVAILABLE", {
      defined: true,
      message: "Fillagring är inte tillgänglig, försök igen senare",
    })
    const api: ApplyApi = {
      apply: async () => {
        throw unavailable
      },
    }
    const out = await submitApplicationCore({ api: async () => api, openJobs }, fd())
    expect(out).toMatchObject({ ok: false, message: STORAGE_UNAVAILABLE_MESSAGE })
  })

  test("any other failure is the generic unavailable message", async () => {
    const api: ApplyApi = {
      apply: async () => {
        throw new Error("down")
      },
    }
    const out = await submitApplicationCore({ api: async () => api, openJobs }, fd())
    expect(out).toMatchObject({ ok: false, message: UNAVAILABLE })
  })
})

describe("resolveApplyLocale", () => {
  test("cookie wins when set", () => {
    expect(resolveApplyLocale({ cookie: "sv" })).toBe("sv")
  })

  test("falls back to Accept-Language", () => {
    expect(resolveApplyLocale({ acceptLanguage: "sv-SE" })).toBe("sv")
  })

  test("nothing at all: no x-locale", () => {
    expect(resolveApplyLocale({})).toBeUndefined()
  })

  test("an unsupported Accept-Language: no x-locale (falls to the English default)", () => {
    expect(resolveApplyLocale({ acceptLanguage: "de" })).toBeUndefined()
  })
})

describe("applyHeaders", () => {
  test("the client id is forwarded exactly as given", () => {
    const headers = applyHeaders({ serviceToken: "svc", clientId: "anon:abcd" })
    expect(headers["x-api-client-id"]).toBe("anon:abcd")
  })

  test("no client id: no x-api-client-id (so the api buckets it as jobs:unknown)", () => {
    expect(applyHeaders({ serviceToken: "svc" })["x-api-client-id"]).toBeUndefined()
  })

  test("locale is sent as x-locale only when given", () => {
    expect(applyHeaders({ serviceToken: "svc" })["x-locale"]).toBeUndefined()
    expect(applyHeaders({ serviceToken: "svc", locale: "sv" })["x-locale"]).toBe("sv")
  })

  test("x-request-id is sent only when a well-formed id is given", () => {
    expect(applyHeaders({ serviceToken: "svc" })["x-request-id"]).toBeUndefined()
    expect(
      applyHeaders({ serviceToken: "svc", requestId: "bad id" })["x-request-id"]
    ).toBeUndefined()
    expect(applyHeaders({ serviceToken: "svc", requestId: "req-jobs-0001" })["x-request-id"]).toBe(
      "req-jobs-0001"
    )
  })

  test("the service token is always sent as a bearer", () => {
    expect(applyHeaders({ serviceToken: "svc" }).authorization).toBe("Bearer svc")
  })

  test("never a session token: the jobs board has no sign-in", () => {
    expect(applyHeaders({ serviceToken: "svc" })["x-session-token"]).toBeUndefined()
  })
})
