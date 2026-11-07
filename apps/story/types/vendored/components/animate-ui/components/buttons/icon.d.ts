import { type ButtonProps as ButtonPrimitiveProps } from "@repo/ui/components/animate-ui/primitives/buttons/button";
import { type VariantProps } from "class-variance-authority";
import * as React from "react";
declare const buttonVariants: (props?: ({
    variant?: "link" | "default" | "outline" | "accent" | "destructive" | "secondary" | "ghost" | null | undefined;
    size?: "default" | "xs" | "sm" | "lg" | null | undefined;
} & import("class-variance-authority/types").ClassProp) | undefined) => string;
type IconButtonProps = Omit<ButtonPrimitiveProps, "asChild"> & VariantProps<typeof buttonVariants> & {
    children?: React.ReactNode;
};
declare function IconButton({ className, onClick, variant, size, children, ...props }: IconButtonProps): React.JSX.Element;
export { buttonVariants, IconButton, type IconButtonProps };
