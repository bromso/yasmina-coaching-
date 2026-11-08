import type { BookingFormCopy } from "@/content/booking-forms"
import type { PaymentMethod } from "@/lib/mock-payment"
import { cn } from "@/lib/utils"

/*
 * The payment step's choice of method: native radios (arrow keys move between them, one tab stop),
 * each in a large card with a small mark drawn here — simple wordmark-style shapes, not the
 * brands' own artwork — and the method's name as the radio's label. The marks are decorative
 * (`aria-hidden`); the text beside them names each method.
 */

const markClass = "h-8 w-12 shrink-0"

function ApplePayMark() {
  return (
    <svg viewBox="0 0 48 32" aria-hidden="true" className={markClass}>
      <rect width="48" height="32" rx="6" fill="#000" />
      <path
        d="M12.6 12.4c1-.1 1.9.5 2.4.5.5 0 1.5-.6 2.6-.5.5 0 1.7.2 2.4 1.3-2 1.2-1.7 4 .3 4.9-.4 1.1-1.4 2.7-2.3 2.7-.8 0-1.1-.5-2.1-.5s-1.4.5-2.1.5c-1.2 0-3-2.6-3-5.2 0-2.2 1.3-3.6 1.8-3.7z"
        fill="#fff"
      />
      <path
        d="M15.9 9.2c.6-.7 1.6-1.2 1.6-1.2s.1 1-.6 1.8c-.6.7-1.6 1-1.6 1s0-.9.6-1.6z"
        fill="#fff"
      />
      <text
        x="33.5"
        y="20.5"
        textAnchor="middle"
        fontFamily="system-ui, sans-serif"
        fontSize="10"
        fontWeight="600"
        fill="#fff"
      >
        Pay
      </text>
    </svg>
  )
}

function GooglePayMark() {
  return (
    <svg viewBox="0 0 48 32" aria-hidden="true" className={markClass}>
      <rect x="0.5" y="0.5" width="47" height="31" rx="5.5" fill="#fff" stroke="#c7c7c7" />
      <path d="M17 16h-4.5v2h2.4a2.7 2.7 0 1 1-.8-3l1.4-1.4A4.7 4.7 0 1 0 17 16z" fill="#4285f4" />
      <text
        x="31"
        y="20.5"
        textAnchor="middle"
        fontFamily="system-ui, sans-serif"
        fontSize="10"
        fontWeight="600"
        fill="#3c4043"
      >
        Pay
      </text>
    </svg>
  )
}

function SwishMark() {
  return (
    <svg viewBox="0 0 48 32" aria-hidden="true" className={markClass}>
      <rect x="0.5" y="0.5" width="47" height="31" rx="5.5" fill="#fff" stroke="#c7c7c7" />
      <path
        d="M9 19a7 7 0 0 1 11-7"
        fill="none"
        stroke="#18a14a"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M21 13a7 7 0 0 1-11 7"
        fill="none"
        stroke="#1f7ae0"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <text
        x="35"
        y="19.5"
        textAnchor="middle"
        fontFamily="system-ui, sans-serif"
        fontSize="8.5"
        fontWeight="600"
        fill="#1f2a37"
      >
        swish
      </text>
    </svg>
  )
}

function InvoiceMark() {
  return (
    <svg viewBox="0 0 48 32" aria-hidden="true" className={markClass}>
      <rect x="0.5" y="0.5" width="47" height="31" rx="5.5" fill="#fff" stroke="#c7c7c7" />
      <path d="M17 6h10l5 5v15H17z" fill="#f4f1ea" stroke="#5b5348" strokeLinejoin="round" />
      <path d="M27 6v5h5" fill="none" stroke="#5b5348" strokeLinejoin="round" />
      <path d="M20 15h9M20 18.5h9M20 22h5" stroke="#5b5348" strokeLinecap="round" />
    </svg>
  )
}

export const PAYMENT_MARKS: Record<PaymentMethod, () => React.JSX.Element> = {
  apple_pay: ApplePayMark,
  google_pay: GooglePayMark,
  swish: SwishMark,
  invoice: InvoiceMark,
}

type PaymentMethodsProps = {
  copy: BookingFormCopy["payment"]
  methods: readonly PaymentMethod[]
  value: PaymentMethod | null
  onChange: (method: PaymentMethod) => void
  /** Ids of the hint and the error under the group, for `aria-describedby`. */
  describedBy?: string
  disabled?: boolean
  children?: React.ReactNode
}

/** The radio cards; `children` (the error, the invoice-only note) sit under them. */
export function PaymentMethods({
  copy,
  methods,
  value,
  onChange,
  describedBy,
  disabled,
  children,
}: PaymentMethodsProps) {
  return (
    <fieldset className="grid gap-3" aria-describedby={describedBy} disabled={disabled}>
      <legend className="mb-3 font-medium text-sm">{copy.methodsLegend}</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {methods.map((method) => {
          const Mark = PAYMENT_MARKS[method]
          const text = copy.methods[method]
          return (
            <label
              key={method}
              className={cn(
                "flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl border-2 border-border bg-background/70 px-4 py-3 text-sm",
                "transition-[border-color,background-color,transform] duration-200 ease-out motion-safe:active:scale-[0.99]",
                "has-[:checked]:border-primary has-[:checked]:bg-background has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
                "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
              )}
            >
              <input
                type="radio"
                name="payment-choice"
                value={method}
                checked={value === method}
                onChange={() => onChange(method)}
                className="size-4 shrink-0 accent-primary"
              />
              <Mark />
              <span className="grid min-w-0">
                <span className="font-medium">{text.label}</span>
                <span className="text-muted-foreground text-xs">{text.hint}</span>
              </span>
            </label>
          )
        })}
      </div>
      {children}
    </fieldset>
  )
}
