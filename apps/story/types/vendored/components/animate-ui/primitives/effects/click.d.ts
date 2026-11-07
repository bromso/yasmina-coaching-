import { type HTMLMotionProps, type SVGMotionProps } from "motion/react";
import * as React from "react";
type ClickVariant = "ripple" | "ring" | "crosshair" | "burst" | "particles";
type ClickCommonProps = {
    children?: React.ReactNode;
    color?: string;
    size?: number;
    duration?: number;
    scope?: React.RefObject<HTMLElement | null>;
    disabled?: boolean;
};
type RippleClickProps = HTMLMotionProps<"div"> & ClickCommonProps & {
    variant: "ripple";
};
type SvgClickProps = SVGMotionProps<"svg"> & ClickCommonProps & {
    variant?: Exclude<ClickVariant, "ripple">;
};
type ClickProps = RippleClickProps | SvgClickProps;
declare function Click(props: RippleClickProps): React.ReactElement | null;
declare function Click(props: SvgClickProps): React.ReactElement | null;
export { Click, type ClickProps, type ClickVariant };
