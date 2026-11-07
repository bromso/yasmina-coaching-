import { type CheckboxProps as CheckboxPrimitiveProps } from "@repo/ui/components/animate-ui/primitives/radix/checkbox";
import { type VariantProps } from "class-variance-authority";
declare const checkboxVariants: (props?: ({
    variant?: "default" | "accent" | null | undefined;
    size?: "default" | "sm" | "lg" | null | undefined;
} & import("class-variance-authority/types").ClassProp) | undefined) => string;
type CheckboxProps = CheckboxPrimitiveProps & VariantProps<typeof checkboxVariants>;
declare function Checkbox({ className, children, variant, size, ...props }: CheckboxProps): import("react").JSX.Element;
export { Checkbox, type CheckboxProps };
