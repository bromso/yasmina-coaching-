/**
 * Every payment on the booking pages, behind one seam. Today it is a mock: nothing is charged, and
 * the payment step (`payment-step.tsx`) only calls `authoriseMockPayment` in the browser before it
 * submits the booking form with the chosen method's key (`paymentMethod`) — plus, for an
 * organisation paying by invoice, its billing details, which the server action adds to the
 * booking's notes. The Swish number never leaves the browser.
 *
 * A real provider replaces this file and must keep the money and the booking in step:
 *
 * 1. **Authorise** the payment (Apple Pay / Google Pay sheet, a Swish request) without capturing.
 * 2. **Book**: submit the booking form as today; the api may still refuse (a taken slot, a full
 *    event).
 * 3. **Capture** only once the booking exists, or **void** the authorisation when it was refused,
 *    so a refused booking never costs the visitor anything.
 *
 * It must also feature-detect the wallets (`ApplePaySession.canMakePayments()`, the Payment
 * Request API's `canMakePayment()` for Google Pay) and offer only what the browser supports; the
 * mock offers all of them.
 *
 * Client-safe and pure (no React, no Next), so the server action and `bun test` read it too.
 */

/** The four ways to pay, in the order the payment step lists them. */
export const PAYMENT_METHODS = ["apple_pay", "google_pay", "swish", "invoice"] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const isPaymentMethod = (raw: unknown): raw is PaymentMethod =>
  typeof raw === "string" && (PAYMENT_METHODS as readonly string[]).includes(raw)

/**
 * Whether the mock card, wallet and Swish payments are offered at all: `NEXT_PUBLIC_BOOKING_PAYMENTS`
 * as it was at `next build` (Next inlines `NEXT_PUBLIC_*` into both bundles). `mock` turns them on;
 * any other value turns them off; unset, they are on outside production and off in it, so a
 * production build never takes a pretend payment unless someone asked for it. Off, every booking
 * pays by invoice only and no "test mode" line is shown anywhere.
 */
export function mockPaymentsOn(
  raw: string | undefined = process.env.NEXT_PUBLIC_BOOKING_PAYMENTS,
  nodeEnv: string | undefined = process.env.NODE_ENV
): boolean {
  if (raw) return raw === "mock"
  return nodeEnv !== "production"
}

/**
 * What a visitor may choose: every method when the offering has a fixed price and the mock is on
 * (`mock`, default `mockPaymentsOn()`), invoice only otherwise — the leadership sessions,
 * programmes and group are priced in writing first.
 */
export const methodsFor = (priced: boolean, mock = mockPaymentsOn()): readonly PaymentMethod[] =>
  priced && mock ? PAYMENT_METHODS : ["invoice"]

/**
 * The method a booking was paid with, from an untrusted form value: only one of the four keys, and
 * only one the offering allows (see `methodsFor`). Anything else is `undefined`, which the server
 * action refuses.
 */
export function paidFor(
  raw: unknown,
  priced: boolean,
  mock = mockPaymentsOn()
): PaymentMethod | undefined {
  return isPaymentMethod(raw) && methodsFor(priced, mock).includes(raw) ? raw : undefined
}

/**
 * The payment line `/book/done` shows, by key: a wallet or Swish (always the mock, so it says
 * "test mode"), or an invoice — to the private client's email, to an organisation's invoice
 * address, or after Yasmina has confirmed the price (an offering priced in writing).
 */
export const DONE_PAYMENTS = [
  "apple_pay",
  "google_pay",
  "swish",
  "invoice",
  "invoice_org",
  "invoice_quote",
] as const
export type DonePayment = (typeof DONE_PAYMENTS)[number]

export const isDonePayment = (raw: unknown): raw is DonePayment =>
  typeof raw === "string" && (DONE_PAYMENTS as readonly string[]).includes(raw)

/** Whether a done-page key is one of the mock's own (shown only while the mock is on). */
export const isMockOnly = (key: DonePayment): boolean =>
  key === "apple_pay" || key === "google_pay" || key === "swish"

/** The done-page key for a booking paid with `method` by `audience`, priced or not. */
export function donePaymentOf(
  method: PaymentMethod,
  audience: "private" | "organisation",
  priced: boolean
): DonePayment {
  if (method !== "invoice") return method
  if (!priced) return "invoice_quote"
  return audience === "organisation" ? "invoice_org" : "invoice"
}

/**
 * A Swedish mobile number as Swish takes it: `07x xxx xx xx`, `+46 7x …` or `0046 7x …`, spaces
 * and dashes allowed. Returns it as `+467xxxxxxxx`, or `null` when it is not one.
 */
export function normaliseSwishNumber(raw: string): string | null {
  const compact = raw.replace(/[\s-]/g, "")
  const match = /^(?:\+46|0046|0)(7[02369]\d{7})$/.exec(compact)
  return match ? `+46${match[1]}` : null
}

/**
 * A Swedish organisation number (`NNNNNN-NNNN`, the dash optional): ten digits whose last is the
 * Luhn check digit of the first nine.
 */
export function isOrgNumber(raw: string): boolean {
  const digits = raw.replace(/[\s-]/g, "")
  if (!/^\d{10}$/.test(digits)) return false
  let sum = 0
  for (let i = 0; i < 10; i++) {
    const n = Number(digits[i]) * (i % 2 === 0 ? 2 : 1)
    sum += n > 9 ? n - 9 : n
  }
  return sum % 10 === 0
}

/** An organisation number written the usual way, `NNNNNN-NNNN`. */
export const formatOrgNumber = (raw: string): string => {
  const digits = raw.replace(/[\s-]/g, "")
  return `${digits.slice(0, 6)}-${digits.slice(6)}`
}

/** How long each mock authorisation waits, in ms: the wallet sheet, the Swish app, an invoice. */
export const MOCK_DELAYS: Record<PaymentMethod, number> = {
  apple_pay: 1200,
  google_pay: 1200,
  swish: 2000,
  invoice: 0,
}

/**
 * Step 1 of the seam, mocked: "authorises" after roughly as long as the real one would take.
 * Aborting the signal (the visitor pressed Cancel, or left the step) rejects with an `AbortError`.
 * There is no capture or void to mock: nothing was ever reserved.
 */
export function authoriseMockPayment(
  method: PaymentMethod,
  { signal, delays = MOCK_DELAYS }: { signal?: AbortSignal; delays?: Record<PaymentMethod, number> }
): Promise<"authorised"> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer)
      reject(new DOMException("Payment cancelled", "AbortError"))
    }
    if (signal?.aborted) {
      reject(new DOMException("Payment cancelled", "AbortError"))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort)
      resolve("authorised")
    }, delays[method])
    signal?.addEventListener("abort", abort, { once: true })
  })
}
