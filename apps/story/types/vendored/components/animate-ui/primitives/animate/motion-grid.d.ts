import { type WithAsChild } from "@repo/ui/components/animate-ui/primitives/animate/slot";
import { type HTMLMotionProps } from "motion/react";
import * as React from "react";
type FrameDot = [number, number];
type Frame = FrameDot[];
type Frames = Frame[];
type MotionGridProps = WithAsChild<{
    gridSize: [number, number];
    frames: Frames;
    duration?: number;
    animate?: boolean;
} & HTMLMotionProps<"div">>;
declare const MotionGrid: ({ gridSize, frames, duration, animate, asChild, style, ...props }: MotionGridProps) => React.JSX.Element;
type MotionGridCellsProps = HTMLMotionProps<"div"> & {
    activeProps?: HTMLMotionProps<"div">;
    inactiveProps?: HTMLMotionProps<"div">;
};
declare function MotionGridCells({ activeProps, inactiveProps, ...props }: MotionGridCellsProps): React.JSX.Element[];
export { type Frame, type FrameDot, type Frames, MotionGrid, MotionGridCells, type MotionGridCellsProps, type MotionGridProps, };
