import {
  ProgressIndicator as ProgressIndicatorPrimitive,
  Progress as ProgressPrimitive,
  type ProgressProps as ProgressPrimitiveProps,
} from "@repo/ui/components/animate-ui/primitives/radix/progress"
import { cn } from "@repo/ui/lib/utils"

type ProgressProps = ProgressPrimitiveProps

function Progress({ className, ...props }: ProgressProps) {
  return (
    <ProgressPrimitive
      className={cn("bg-primary/20 relative h-2 w-full overflow-hidden rounded-full", className)}
      {...props}
    >
      <ProgressIndicatorPrimitive className="bg-primary rounded-full h-full w-full flex-1" />
    </ProgressPrimitive>
  )
}

export { Progress, type ProgressProps }
