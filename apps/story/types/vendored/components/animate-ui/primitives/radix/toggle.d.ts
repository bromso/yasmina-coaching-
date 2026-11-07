import { type HTMLMotionProps } from "motion/react";
import { Toggle as TogglePrimitive } from "radix-ui";
import type * as React from "react";
type ToggleContextType = {
    isPressed: boolean;
    setIsPressed: (isPressed: boolean) => void;
    disabled?: boolean;
};
declare const useToggle: () => ToggleContextType;
type ToggleProps = Omit<React.ComponentProps<typeof TogglePrimitive.Root>, "asChild"> & HTMLMotionProps<"button">;
declare function Toggle({ pressed, defaultPressed, onPressedChange, disabled, ...props }: ToggleProps): React.JSX.Element;
type ToggleHighlightProps = HTMLMotionProps<"div">;
declare function ToggleHighlight({ style, ...props }: ToggleHighlightProps): React.JSX.Element;
type ToggleItemProps = HTMLMotionProps<"div">;
declare function ToggleItem({ style, ...props }: ToggleItemProps): React.JSX.Element;
export { Toggle, type ToggleContextType, ToggleHighlight, type ToggleHighlightProps, ToggleItem, type ToggleItemProps, type ToggleProps, useToggle, };
