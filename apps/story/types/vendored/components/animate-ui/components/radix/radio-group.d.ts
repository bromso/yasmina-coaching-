import { type RadioGroupItemProps as RadioGroupItemPrimitiveProps, type RadioGroupProps as RadioGroupPrimitiveProps } from "@repo/ui/components/animate-ui/primitives/radix/radio-group";
type RadioGroupProps = RadioGroupPrimitiveProps;
declare function RadioGroup({ className, ...props }: RadioGroupProps): import("react").JSX.Element;
type RadioGroupItemProps = RadioGroupItemPrimitiveProps;
declare function RadioGroupItem({ className, ...props }: RadioGroupItemProps): import("react").JSX.Element;
export { RadioGroup, RadioGroupItem, type RadioGroupItemProps, type RadioGroupProps };
