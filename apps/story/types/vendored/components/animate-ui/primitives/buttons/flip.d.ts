import { type WithAsChild } from "@repo/ui/components/animate-ui/primitives/animate/slot";
import { type HTMLMotionProps } from "motion/react";
type FlipDirection = "top" | "bottom" | "left" | "right";
type FlipButtonContextType = {
    from: FlipDirection;
    isVertical: boolean;
    rotateAxis: string;
};
declare const useFlipButton: () => FlipButtonContextType;
type FlipButtonProps = WithAsChild<HTMLMotionProps<"button"> & {
    from?: FlipDirection;
    tapScale?: number;
}>;
declare function FlipButton({ from, tapScale, asChild, style, ...props }: FlipButtonProps): import("react").JSX.Element;
type FlipButtonFaceProps = WithAsChild<HTMLMotionProps<"span">>;
declare function FlipButtonFront({ transition, asChild, style, ...props }: FlipButtonFaceProps): import("react").JSX.Element;
declare function FlipButtonBack({ transition, asChild, style, ...props }: FlipButtonFaceProps): import("react").JSX.Element;
export { FlipButton, FlipButtonBack, type FlipButtonContextType, type FlipButtonFaceProps as FlipButtonFrontProps, type FlipButtonFaceProps as FlipButtonBackProps, FlipButtonFront, type FlipButtonProps, type FlipDirection, useFlipButton, };
