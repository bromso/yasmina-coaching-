import { cn } from "@/lib/utils"

type StepIndicatorProps = {
  steps: readonly string[]
  /** 1-based. */
  current: number
  /** "Step 1 of 3", in the page's language. */
  stepOf: (n: number, total: number) => string
  className?: string
}

/** "Step 1 of 3 · Pick a time": an ordered list, the current step marked for assistive tech. */
export function StepIndicator({ steps, current, stepOf, className }: StepIndicatorProps) {
  return (
    <ol
      aria-label={stepOf(current, steps.length)}
      className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-sm", className)}
    >
      {steps.map((label, i) => {
        const n = i + 1
        const state = n === current ? "current" : n < current ? "done" : "todo"
        return (
          <li
            key={label}
            aria-current={state === "current" ? "step" : undefined}
            className={cn(
              "flex items-center gap-2",
              state === "current" ? "font-medium text-foreground" : "text-muted-foreground"
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "flex size-6 items-center justify-center rounded-full border font-display text-xs transition-colors duration-300",
                // The ring runs once when a step becomes current: the class moves to a new element.
                state === "current" &&
                  "border-primary bg-primary text-primary-foreground motion-safe:animate-ring-pulse",
                state === "done" && "border-foreground/40",
                state === "todo" && "border-border"
              )}
            >
              {n}
            </span>
            <span>
              <span className="sr-only">{`${stepOf(n, steps.length)}: `}</span>
              {label}
            </span>
            {n < steps.length && (
              <span aria-hidden="true" className="text-muted-foreground/60">
                ·
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
