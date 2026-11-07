import { type ToggleItemProps as ToggleItemPrimitiveProps, type ToggleProps as TogglePrimitiveProps } from "@repo/ui/components/animate-ui/primitives/base/toggle";
import { type VariantProps } from "class-variance-authority";
declare const toggleVariants: (props?: ({
    variant?: "default" | "outline" | null | undefined;
    size?: "default" | "icon" | "sm" | "lg" | null | undefined;
} & import("class-variance-authority/types").ClassProp) | undefined) => string;
type ToggleProps = TogglePrimitiveProps & ToggleItemPrimitiveProps & VariantProps<typeof toggleVariants>;
declare function Toggle({ className, variant, size, pressed, defaultPressed, onPressedChange, disabled, ...props }: ToggleProps): import("react").JSX.Element;
export { Toggle, type ToggleProps, toggleVariants };
