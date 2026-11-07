import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { type HTMLMotionProps, type SVGMotionProps } from "motion/react";
import type * as React from "react";
type CheckboxContextType = {
    isChecked: boolean;
    setIsChecked: CheckboxProps["onCheckedChange"];
    isIndeterminate: boolean | undefined;
};
declare const useCheckbox: () => CheckboxContextType;
type CheckboxProps = Omit<React.ComponentProps<typeof CheckboxPrimitive.Root>, "render"> & HTMLMotionProps<"button">;
declare function Checkbox({ name, checked, defaultChecked, onCheckedChange, indeterminate, value, nativeButton, parent, disabled, readOnly, required, inputRef, id, ...props }: CheckboxProps): React.JSX.Element;
type CheckboxIndicatorProps = SVGMotionProps<SVGSVGElement>;
declare function CheckboxIndicator(props: CheckboxIndicatorProps): React.JSX.Element;
export { Checkbox, type CheckboxContextType, CheckboxIndicator, type CheckboxIndicatorProps, type CheckboxProps, useCheckbox, };
