import { type CheckboxProps as CheckboxPrimitiveProps } from "@repo/ui/components/animate-ui/primitives/headless/checkbox";
import { type VariantProps } from "class-variance-authority";
import type { motion } from "motion/react";
import type * as React from "react";
declare const checkboxVariants: (props?: ({
    variant?: "default" | "accent" | null | undefined;
    size?: "default" | "sm" | "lg" | null | undefined;
} & import("class-variance-authority/types").ClassProp) | undefined) => string;
type CheckboxProps<TTag extends React.ElementType = typeof motion.button> = CheckboxPrimitiveProps<TTag> & VariantProps<typeof checkboxVariants>;
declare function Checkbox<TTag extends React.ElementType = typeof motion.button>({ className, children, variant, size, ...props }: CheckboxProps<TTag>): React.JSX.Element;
export { Checkbox, type CheckboxProps };
