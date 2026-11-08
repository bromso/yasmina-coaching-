import { cn } from "@/lib/utils"

type StepIndicatorProps = {
  steps: readonly string[]
  /** 1-based. */
  current: number
  /** "Step 1 of 4", in the page's language. */
  stepOf: (n: number, total: number) => string
  /** Read after a finished step's name ("done"); the check mark alone says nothing. */
  doneLabel: string
  /** Makes each finished step a button back to it. Later steps are never focusable. */
  onStepClick?: (n: number) => void
  className?: string
}

/** A check mark drawn inline: the done page renders this server-side, without the icon bundle. */
function Check() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none">
      <path
        d="M5 12.5l4.5 4.5L19 7.5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * The booking journey's stepper. From `sm` up: numbered circles joined by a line that fills as
 * the visitor moves on, a check on every finished step (a button back to it when `onStepClick`
 * is given), `aria-current="step"` on the current one. Below `sm` it folds into one line, "Step 2
 * of 4 · Your details", over a thin progress bar, so it never overflows at 320 px. Both halves are
 * plain markup (no client JavaScript of its own); the line and bar animate only without
 * `prefers-reduced-motion`.
 */
export function StepIndicator({
  steps,
  current,
  stepOf,
  doneLabel,
  onStepClick,
  className,
}: StepIndicatorProps) {
  const total = steps.length
  return (
    <div className={cn("step-indicator", className)}>
      <div className="grid gap-2 sm:hidden">
        <p className="text-sm">
          <span className="font-medium">{stepOf(current, total)}</span>
          <span aria-hidden="true"> · </span>
          <span className="sr-only">: </span>
          {steps[current - 1]}
        </p>
        <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
          <div
            className="h-full origin-left rounded-full bg-primary motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out"
            style={{ transform: `scaleX(${current / total})` }}
          />
        </div>
      </div>
      <ol
        aria-label={stepOf(current, total)}
        className="hidden sm:grid"
        style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}
      >
        {steps.map((label, i) => {
          const n = i + 1
          const state = n === current ? "current" : n < current ? "done" : "todo"
          const circle = (
            <span
              aria-hidden="true"
              className={cn(
                "flex size-9 items-center justify-center rounded-full border-2 font-display text-sm transition-colors duration-300",
                // The ring runs once when a step becomes current: the class moves to a new element.
                state === "current" &&
                  "border-primary bg-primary text-primary-foreground motion-safe:animate-ring-pulse",
                state === "done" && "border-primary bg-background text-foreground",
                state === "todo" && "border-border bg-background text-muted-foreground"
              )}
            >
              {state === "done" ? <Check /> : n}
            </span>
          )
          const text = (
            <span
              className={cn(
                "text-pretty text-xs leading-snug sm:text-sm",
                state === "current" ? "font-medium text-foreground" : "text-muted-foreground"
              )}
            >
              <span className="sr-only">{`${stepOf(n, total)}: `}</span>
              {label}
              {state === "done" && <span className="sr-only">{`, ${doneLabel}`}</span>}
            </span>
          )
          const body = "relative z-10 flex flex-col items-center gap-1.5 px-1 py-1 text-center"
          return (
            <li
              key={label}
              aria-current={state === "current" ? "step" : undefined}
              className="relative"
            >
              {n < total && (
                <span
                  aria-hidden="true"
                  className="absolute top-[1.375rem] left-1/2 h-0.5 w-full -translate-y-1/2 bg-border"
                >
                  <span
                    className="block h-full origin-left bg-primary motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out"
                    style={{ transform: `scaleX(${n < current ? 1 : 0})` }}
                  />
                </span>
              )}
              {state === "done" && onStepClick ? (
                <button
                  type="button"
                  onClick={() => onStepClick(n)}
                  className={cn(
                    body,
                    "mx-auto min-h-11 min-w-11 rounded-2xl hover:[&>span:last-child]:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  )}
                >
                  {circle}
                  {text}
                </button>
              ) : (
                <div className={body}>
                  {circle}
                  {text}
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
