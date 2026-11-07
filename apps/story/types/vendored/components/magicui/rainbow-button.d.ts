import { type VariantProps } from "class-variance-authority";
import React from "react";
declare const rainbowButtonVariants: (props?: ({
    variant?: "default" | "outline" | null | undefined;
    size?: "default" | "icon" | "sm" | "lg" | null | undefined;
} & import("class-variance-authority/types").ClassProp) | undefined) => string;
interface RainbowButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof rainbowButtonVariants> {
    asChild?: boolean;
}
declare const RainbowButton: React.ForwardRefExoticComponent<RainbowButtonProps & React.RefAttributes<HTMLButtonElement>>;
export { RainbowButton, type RainbowButtonProps, rainbowButtonVariants };
