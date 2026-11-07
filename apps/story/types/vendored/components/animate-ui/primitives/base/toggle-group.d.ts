import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group";
import { type HighlightItemProps, type HighlightProps } from "@repo/ui/components/animate-ui/primitives/effects/highlight";
import { type HTMLMotionProps } from "motion/react";
import * as React from "react";
type ToggleGroupContextType = {
    value: any[];
    setValue: ToggleGroupProps["onValueChange"];
    multiple: boolean | undefined;
};
declare const useToggleGroup: () => ToggleGroupContextType;
type ToggleGroupProps = React.ComponentProps<typeof ToggleGroupPrimitive>;
declare function ToggleGroup(props: ToggleGroupProps): React.JSX.Element;
type ToggleProps = Omit<React.ComponentProps<typeof TogglePrimitive>, "render"> & HTMLMotionProps<"button">;
declare function Toggle({ value, pressed, defaultPressed, onPressedChange, nativeButton, disabled, ...props }: ToggleProps): React.JSX.Element;
type ToggleGroupHighlightProps = Omit<HighlightProps, "controlledItems">;
declare function ToggleGroupHighlight({ transition, ...props }: ToggleGroupHighlightProps): React.JSX.Element;
type ToggleHighlightProps = HighlightItemProps & HTMLMotionProps<"div"> & {
    children: React.ReactElement;
};
declare function ToggleHighlight({ children, style, ...props }: ToggleHighlightProps): React.JSX.Element | undefined;
export { Toggle, ToggleGroup, type ToggleGroupContextType, ToggleGroupHighlight, type ToggleGroupHighlightProps, type ToggleGroupProps, ToggleHighlight, type ToggleHighlightProps, type ToggleProps, useToggleGroup, };
