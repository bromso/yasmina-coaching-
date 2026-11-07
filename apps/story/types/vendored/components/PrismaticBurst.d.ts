import type React from "react";
type Offset = {
    x?: number | string;
    y?: number | string;
};
type AnimationType = "rotate" | "rotate3d" | "hover";
export type PrismaticBurstProps = {
    intensity?: number;
    speed?: number;
    animationType?: AnimationType;
    colors?: string[];
    distort?: number;
    paused?: boolean;
    offset?: Offset;
    hoverDampness?: number;
    rayCount?: number;
    mixBlendMode?: React.CSSProperties["mixBlendMode"] | "none";
};
declare const PrismaticBurst: ({ intensity, speed, animationType, colors, distort, paused, offset, hoverDampness, rayCount, mixBlendMode, }: PrismaticBurstProps) => React.JSX.Element;
export default PrismaticBurst;
