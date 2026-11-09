"use client"

import dynamic from "next/dynamic"
import { useBookingCopy } from "@/components/booking/locale-provider"

function PaymentLoading() {
  const copy = useBookingCopy()
  return (
    <p role="status" className="text-muted-foreground text-sm">
      {copy.payment.loading}
    </p>
  )
}

/**
 * The payment step, loaded only once a visitor reaches the details step (the journeys mount it
 * then), so the offering page's first load carries none of it. Client-only: it has nothing to
 * show before the visitor has picked a time and given their details.
 */
export const LazyPaymentStep = dynamic(
  () => import("@/components/booking/payment-step").then((m) => m.PaymentStep),
  { ssr: false, loading: () => <PaymentLoading /> }
)
