import { type HTMLMotionProps, type LegacyAnimationControls, type TargetAndTransition, type VariantLabels } from "motion/react";
import { Switch as SwitchPrimitives } from "radix-ui";
import * as React from "react";
type SwitchContextType = {
    isChecked: boolean;
    setIsChecked: (isChecked: boolean) => void;
    isPressed: boolean;
    setIsPressed: (isPressed: boolean) => void;
};
declare const useSwitch: () => SwitchContextType;
type SwitchProps = Omit<React.ComponentProps<typeof SwitchPrimitives.Root>, "asChild"> & HTMLMotionProps<"button">;
declare function Switch(props: SwitchProps): React.JSX.Element;
type SwitchThumbProps = Omit<React.ComponentProps<typeof SwitchPrimitives.Thumb>, "asChild"> & HTMLMotionProps<"div"> & {
    pressedAnimation?: TargetAndTransition | VariantLabels | boolean | LegacyAnimationControls;
};
declare function SwitchThumb({ pressedAnimation, transition, ...props }: SwitchThumbProps): React.JSX.Element;
type SwitchIconPosition = "left" | "right" | "thumb";
type SwitchIconProps = HTMLMotionProps<"div"> & {
    position: SwitchIconPosition;
};
declare function SwitchIcon({ position, transition, ...props }: SwitchIconProps): React.JSX.Element;
export { Switch, type SwitchContextType, SwitchIcon, type SwitchIconPosition, type SwitchIconProps, type SwitchProps, SwitchThumb, type SwitchThumbProps, useSwitch, };
