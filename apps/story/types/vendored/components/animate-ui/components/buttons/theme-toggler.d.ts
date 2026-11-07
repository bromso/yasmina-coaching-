import { buttonVariants } from "@repo/ui/components/animate-ui/components/buttons/icon";
import { type ThemeSelection, type ThemeTogglerProps as ThemeTogglerPrimitiveProps } from "@repo/ui/components/animate-ui/primitives/effects/theme-toggler";
import type { VariantProps } from "class-variance-authority";
import type * as React from "react";
type ThemeTogglerButtonProps = React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & {
    modes?: ThemeSelection[];
    onImmediateChange?: ThemeTogglerPrimitiveProps["onImmediateChange"];
    direction?: ThemeTogglerPrimitiveProps["direction"];
};
declare function ThemeTogglerButton({ variant, size, modes, direction, onImmediateChange, onClick, className, ...props }: ThemeTogglerButtonProps): React.JSX.Element;
export { ThemeTogglerButton, type ThemeTogglerButtonProps };
