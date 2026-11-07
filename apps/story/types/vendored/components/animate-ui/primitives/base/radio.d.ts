import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { type HTMLMotionProps } from "motion/react";
import * as React from "react";
type RadioGroupContextType = {
    value: RadioGroupProps["value"];
    setValue: RadioGroupProps["onValueChange"];
};
type RadioContextType = {
    isChecked: boolean;
    setIsChecked: (isChecked: boolean) => void;
};
declare const useRadioGroup: () => RadioGroupContextType;
declare const useRadio: () => RadioContextType;
type RadioGroupProps = React.ComponentProps<typeof RadioGroupPrimitive>;
declare function RadioGroup(props: RadioGroupProps): React.JSX.Element;
type RadioIndicatorProps = Omit<React.ComponentProps<typeof RadioPrimitive.Indicator>, "asChild" | "forceMount"> & HTMLMotionProps<"div">;
declare function RadioIndicator({ transition, ...props }: RadioIndicatorProps): React.JSX.Element;
type RadioProps = Omit<React.ComponentProps<typeof RadioPrimitive.Root>, "asChild"> & HTMLMotionProps<"button">;
declare function Radio({ value: valueProps, disabled, required, ...props }: RadioProps): React.JSX.Element;
export { Radio, type RadioContextType, RadioGroup, type RadioGroupContextType, type RadioGroupProps, RadioIndicator, type RadioIndicatorProps, type RadioProps, useRadio, useRadioGroup, };
