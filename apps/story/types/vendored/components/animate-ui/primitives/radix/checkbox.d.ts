import { type HTMLMotionProps, type SVGMotionProps } from "motion/react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import type * as React from "react";
type CheckboxContextType = {
    isChecked: boolean | "indeterminate";
    setIsChecked: (checked: boolean | "indeterminate") => void;
};
declare const useCheckbox: () => CheckboxContextType;
type CheckboxProps = HTMLMotionProps<"button"> & Omit<React.ComponentProps<typeof CheckboxPrimitive.Root>, "asChild">;
declare function Checkbox({ defaultChecked, checked, onCheckedChange, disabled, required, name, value, ...props }: CheckboxProps): React.JSX.Element;
type CheckboxIndicatorProps = SVGMotionProps<SVGSVGElement>;
declare function CheckboxIndicator(props: CheckboxIndicatorProps): React.JSX.Element;
export { Checkbox, type CheckboxContextType, CheckboxIndicator, type CheckboxIndicatorProps, type CheckboxProps, useCheckbox, };
