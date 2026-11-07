import { type VariantProps } from "class-variance-authority";
import { type HTMLMotionProps } from "motion/react";
import * as React from "react";
declare const buttonVariants: (props?: ({
    size?: "default" | "sm" | "lg" | "md" | null | undefined;
    icon?: "prefix" | "suffix" | null | undefined;
} & import("class-variance-authority/types").ClassProp) | undefined) => string;
type ShareButtonProps = HTMLMotionProps<"button"> & {
    children: React.ReactNode;
    className?: string;
    onIconClick?: (platform: "github" | "x" | "facebook") => void;
} & VariantProps<typeof buttonVariants>;
declare function ShareButton({ children, className, size, icon, onIconClick, ...props }: ShareButtonProps): React.JSX.Element;
export { ShareButton, type ShareButtonProps };
