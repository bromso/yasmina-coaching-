import { type ButtonProps as ButtonPrimitiveProps } from "@repo/ui/components/animate-ui/primitives/buttons/button";
import { type VariantProps } from "class-variance-authority";
declare const buttonVariants: (props?: ({
    variant?: "link" | "default" | "outline" | "accent" | "destructive" | "secondary" | "ghost" | null | undefined;
    size?: "default" | "icon" | "sm" | "lg" | "icon-sm" | "icon-lg" | null | undefined;
} & import("class-variance-authority/types").ClassProp) | undefined) => string;
type ButtonProps = ButtonPrimitiveProps & VariantProps<typeof buttonVariants>;
declare function Button({ className, variant, size, ...props }: ButtonProps): import("react").JSX.Element;
export { Button, type ButtonProps, buttonVariants };
