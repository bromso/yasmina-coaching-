import { type HighlightItemProps, type HighlightProps } from "@repo/ui/components/animate-ui/primitives/effects/highlight";
import { type HTMLMotionProps } from "motion/react";
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import * as React from "react";
type ToggleGroupContextType = {
    value: string | string[] | undefined;
    setValue: (value: string | string[] | undefined) => void;
    type: "single" | "multiple";
};
declare const useToggleGroup: () => ToggleGroupContextType;
type ToggleGroupProps = React.ComponentProps<typeof ToggleGroupPrimitive.Root>;
declare function ToggleGroup(props: ToggleGroupProps): React.JSX.Element;
type ToggleGroupItemProps = Omit<React.ComponentProps<typeof ToggleGroupPrimitive.Item>, "asChild"> & HTMLMotionProps<"button">;
declare function ToggleGroupItem({ value, disabled, ...props }: ToggleGroupItemProps): React.JSX.Element;
type ToggleGroupHighlightProps = Omit<HighlightProps, "controlledItems">;
declare function ToggleGroupHighlight({ transition, ...props }: ToggleGroupHighlightProps): React.JSX.Element;
type ToggleGroupHighlightItemProps = HighlightItemProps & HTMLMotionProps<"div"> & {
    children: React.ReactElement;
};
declare function ToggleGroupHighlightItem({ children, style, ...props }: ToggleGroupHighlightItemProps): React.JSX.Element | undefined;
export { ToggleGroup, type ToggleGroupContextType, ToggleGroupHighlight, ToggleGroupHighlightItem, type ToggleGroupHighlightItemProps, type ToggleGroupHighlightProps, ToggleGroupItem, type ToggleGroupItemProps, type ToggleGroupProps, useToggleGroup, };
