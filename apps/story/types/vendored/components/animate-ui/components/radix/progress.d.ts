import { type ProgressProps as ProgressPrimitiveProps } from "@repo/ui/components/animate-ui/primitives/radix/progress";
type ProgressProps = ProgressPrimitiveProps;
declare function Progress({ className, ...props }: ProgressProps): import("react").JSX.Element;
export { Progress, type ProgressProps };
