import { type LiquidButtonProps as LiquidButtonPrimitiveProps } from "@repo/ui/components/animate-ui/primitives/buttons/liquid";
import { type VariantProps } from "class-variance-authority";
declare const buttonVariants: (props?: ({
    variant?: "default" | "destructive" | "secondary" | "ghost" | null | undefined;
    size?: "default" | "icon" | "sm" | "lg" | "icon-sm" | "icon-lg" | null | undefined;
} & import("class-variance-authority/types").ClassProp) | undefined) => string;
type LiquidButtonProps = LiquidButtonPrimitiveProps & VariantProps<typeof buttonVariants>;
declare function LiquidButton({ className, variant, size, ...props }: LiquidButtonProps): import("react").JSX.Element;
export { buttonVariants, LiquidButton, type LiquidButtonProps };
