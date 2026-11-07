import { type HTMLMotionProps } from "motion/react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import * as React from "react";
type RadioGroupContextType = {
    value: string;
    setValue: (value: string) => void;
};
type RadioGroupItemContextType = {
    isChecked: boolean;
    setIsChecked: (isChecked: boolean) => void;
};
declare const useRadioGroup: () => RadioGroupContextType;
declare const useRadioGroupItem: () => RadioGroupItemContextType;
type RadioGroupProps = React.ComponentProps<typeof RadioGroupPrimitive.Root>;
declare function RadioGroup(props: RadioGroupProps): React.JSX.Element;
type RadioGroupIndicatorProps = Omit<React.ComponentProps<typeof RadioGroupPrimitive.Indicator>, "asChild" | "forceMount"> & HTMLMotionProps<"div">;
declare function RadioGroupIndicator({ transition, ...props }: RadioGroupIndicatorProps): React.JSX.Element;
type RadioGroupItemProps = Omit<React.ComponentProps<typeof RadioGroupPrimitive.Item>, "asChild"> & HTMLMotionProps<"button">;
declare function RadioGroupItem({ value: valueProps, disabled, required, ...props }: RadioGroupItemProps): React.JSX.Element;
export { RadioGroup, type RadioGroupContextType, RadioGroupIndicator, type RadioGroupIndicatorProps, RadioGroupItem, type RadioGroupItemContextType, type RadioGroupItemProps, type RadioGroupProps, useRadioGroup, useRadioGroupItem, };
