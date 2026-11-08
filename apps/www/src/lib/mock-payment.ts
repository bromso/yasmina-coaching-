/**
 * Every payment on the booking pages, as a mock: no card, wallet, Swish number or invoice detail
 * leaves the browser, and nothing is charged. The payment step (`payment-step.tsx`) runs
 * `runMockPayment` client-side and then submits the booking form with only the chosen method's
 * key (`paymentMethod`); the server action checks that key with `paidFor` and passes it on to
 * `/book/done` as `?paid=`. A real provider later replaces this one file: keep its exports.
 *
 * Client-safe and pure (no React, no Next), so the server action and `bun test` read it too.
 */

/** The four ways to pay, in the order the payment step lists them. */
export const PAYMENT_METHODS = ["apple_pay", "google_pay", "swish", "invoice"] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const isPaymentMethod = (raw: unknown): raw is PaymentMethod =>
  typeof raw === "string" && (PAYMENT_METHODS as readonly string[]).includes(raw)

/**
 * What a visitor may choose: every method when the offering has a fixed price, invoice only when
 * the price is confirmed in writing first (the leadership sessions, programmes and group).
 */
export const methodsFor = (priced: boolean): readonly PaymentMethod[] =>
  priced ? PAYMENT_METHODS : ["invoice"]

/**
 * The method a booking was paid with, from an untrusted form value: only one of the four keys,
 * and only one the offering allows (`priced`). Anything else is no payment at all.
 */
export function paidFor(raw: unknown, priced: boolean): PaymentMethod | undefined {
  return isPaymentMethod(raw) && methodsFor(priced).includes(raw) ? raw : undefined
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

/** How long each mock waits, in ms: the wallet sheet, the Swish app, and an invoice (none). */
export const MOCK_DELAYS: Record<PaymentMethod, number> = {
  apple_pay: 1200,
  google_pay: 1200,
  swish: 2000,
  invoice: 0,
}

/**
 * A pretend payment: waits as long as the real one roughly would, then approves. Aborting the
 * signal (the visitor pressed Cancel) rejects with an `AbortError` and charges nothing, as now.
 */
export function runMockPayment(
  method: PaymentMethod,
  { signal, delays = MOCK_DELAYS }: { signal?: AbortSignal; delays?: Record<PaymentMethod, number> }
): Promise<"approved"> {
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
      resolve("approved")
    }, delays[method])
    signal?.addEventListener("abort", abort, { once: true })
  })
}
