import { type SwitchProps as SwitchPrimitiveProps } from "@headlessui/react";
import { type HTMLMotionProps, type LegacyAnimationControls, motion, type TargetAndTransition, type VariantLabels } from "motion/react";
import * as React from "react";
type SwitchProps<TTag extends React.ElementType = typeof motion.button> = SwitchPrimitiveProps<TTag> & HTMLMotionProps<"button"> & {
    as?: TTag;
};
declare function Switch<TTag extends React.ElementType = typeof motion.button>(props: SwitchProps<TTag>): React.JSX.Element;
type SwitchThumbProps<TTag extends React.ElementType = typeof motion.div> = HTMLMotionProps<"div"> & {
    as?: TTag;
    pressedAnimation?: TargetAndTransition | VariantLabels | boolean | LegacyAnimationControls;
};
declare function SwitchThumb<TTag extends React.ElementType = typeof motion.div>(props: SwitchThumbProps<TTag>): React.JSX.Element;
type SwitchIconPosition = "left" | "right" | "thumb";
type SwitchIconProps<TTag extends React.ElementType = typeof motion.div> = HTMLMotionProps<"div"> & {
    position: SwitchIconPosition;
    as?: TTag;
};
declare function SwitchIcon<TTag extends React.ElementType = typeof motion.div>(props: SwitchIconProps<TTag>): React.JSX.Element;
export { Switch, SwitchIcon, type SwitchIconProps, type SwitchProps, SwitchThumb, type SwitchThumbProps, };
