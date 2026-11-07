import { type CheckboxProps as CheckboxPrimitiveProps } from "@repo/ui/components/animate-ui/primitives/base/checkbox";
import { type VariantProps } from "class-variance-authority";
import type * as React from "react";
declare const checkboxVariants: (props?: ({
    variant?: "default" | "accent" | null | undefined;
    size?: "default" | "sm" | "lg" | null | undefined;
} & import("class-variance-authority/types").ClassProp) | undefined) => string;
type CheckboxProps = CheckboxPrimitiveProps & VariantProps<typeof checkboxVariants> & {
    children?: React.ReactNode;
};
declare function Checkbox({ className, children, variant, size, ...props }: CheckboxProps): React.JSX.Element;
export { Checkbox, type CheckboxProps };
