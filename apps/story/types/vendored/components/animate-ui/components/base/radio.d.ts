import { type RadioGroupProps as RadioGroupPrimitiveProps, type RadioProps as RadioPrimitiveProps } from "@repo/ui/components/animate-ui/primitives/base/radio";
type RadioGroupProps = RadioGroupPrimitiveProps;
declare function RadioGroup({ className, ...props }: RadioGroupProps): import("react").JSX.Element;
type RadioProps = RadioPrimitiveProps;
declare function Radio({ className, ...props }: RadioProps): import("react").JSX.Element;
export { Radio, RadioGroup, type RadioGroupProps, type RadioProps };
