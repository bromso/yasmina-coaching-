import { type CheckboxProps as CheckboxPrimitiveProps } from "@headlessui/react";
import { type HTMLMotionProps, motion, type SVGMotionProps } from "motion/react";
import type * as React from "react";
type CheckboxContextType = {
    isChecked: boolean;
    isIndeterminate: boolean;
};
declare const useCheckbox: () => CheckboxContextType;
type CheckboxProps<TTag extends React.ElementType = typeof motion.button> = CheckboxPrimitiveProps<TTag> & Omit<HTMLMotionProps<"button">, "checked" | "onChange" | "defaultChecked" | "children"> & {
    as?: TTag;
};
declare function Checkbox<TTag extends React.ElementType = typeof motion.button>({ children, ...props }: CheckboxProps<TTag>): React.JSX.Element;
type CheckboxIndicatorProps = SVGMotionProps<SVGSVGElement>;
declare function CheckboxIndicator(props: CheckboxIndicatorProps): React.JSX.Element;
export { Checkbox, type CheckboxContextType, CheckboxIndicator, type CheckboxIndicatorProps, type CheckboxProps, useCheckbox, };
