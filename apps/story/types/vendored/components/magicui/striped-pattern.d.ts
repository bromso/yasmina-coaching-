import type React from "react";
interface StripedPatternProps extends React.SVGProps<SVGSVGElement> {
    direction?: "left" | "right";
}
export declare function StripedPattern({ direction, className, width, height, ...props }: StripedPatternProps): React.JSX.Element;
export {};
