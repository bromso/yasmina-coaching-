import { motion } from "motion/react";
import { type ComponentProps } from "react";
export type ShimmeringTextProps = Omit<ComponentProps<typeof motion.span>, "children"> & {
    /** The text to render with the shimmering effect. */
    text: string;
    /**
     * Duration in seconds for one shimmer cycle.
     * @defaultValue 1
     */
    duration?: number;
    /**
     * Pause the shimmer (e.g. when the hero leaves the viewport).
     * @defaultValue false
     */
    paused?: boolean;
    /**
     * Legacy alias for `paused`.
     * @defaultValue false
     */
    isStopped?: boolean;
};
export declare function ShimmeringText({ text, duration, isStopped, paused, className, ...props }: ShimmeringTextProps): import("react").JSX.Element;
