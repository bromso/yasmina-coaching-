"use client"

import { type FormEvent, useEffect, useRef, useState } from "react"
import { focusFirstError, stepWithError, withClientErrors } from "@/components/booking/step-panel"
import type { BookingFormState } from "@/lib/booking"

type Options = {
  /** The action's latest answer. */
  state: BookingFormState
  pending: boolean
  /** Each step's field names (a module constant), so a refusal reopens the step holding it. */
  fields: readonly (readonly string[])[]
  /** A `CONFLICT` (a taken slot, a full event): refresh, and the journey starts again at step 1. */
  onConflict?: () => void
  /** The step whose own submit button books; without one, only `submit()` (after payment) does. */
  directSubmitStep?: number
}

/**
 * The orchestration every booking journey shares: the current step, the browser's own checks laid
 * over the server's answer (`shown`), reopening the right step after a refusal, and a form that
 * only submits from its last step — through `submit()` once a payment has been authorised, or its
 * own submit button on `directSubmitStep`. While the payment runs or after it was authorised
 * (`setLocked`), and while the action is pending, the stepper's finished steps stop being buttons.
 */
export function useBookingSteps({ state, pending, fields, onConflict, directSubmitStep }: Options) {
  const [step, setStep] = useState(1)
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({})
  const [locked, setLocked] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const allowSubmit = useRef(false)
  const conflict = useRef(onConflict)
  conflict.current = onConflict

  useEffect(() => {
    setClientErrors({})
    setLocked(false)
    if (!state.ok && state.code === "CONFLICT" && conflict.current) {
      conflict.current()
      setStep(1)
      return
    }
    const errorStep = stepWithError(state, fields)
    if (errorStep) setStep(errorStep)
  }, [state, fields])

  const goTo = (n: number) => {
    setClientErrors({})
    setStep(n)
  }

  /** Shows `errors` (and focuses the first); `true` when there were any. */
  const fail = (errors: Record<string, string>): boolean => {
    setClientErrors(errors)
    const names = Object.keys(errors)
    if (names.length === 0) return false
    focusFirstError(formRef.current, names)
    return true
  }

  const submit = () => {
    allowSubmit.current = true
    formRef.current?.requestSubmit()
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    const ok = allowSubmit.current || step === directSubmitStep
    allowSubmit.current = false
    if (!ok) event.preventDefault()
  }

  return {
    step,
    goTo,
    formRef,
    shown: withClientErrors(state, clientErrors),
    fail,
    submit,
    onSubmit,
    locked,
    setLocked,
    /** The stepper's `onStepClick`: none while the action is pending or a payment is locked in. */
    stepClick: pending || locked ? undefined : goTo,
  }
}
