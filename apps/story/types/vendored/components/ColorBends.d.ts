import type React from "react";
type ColorBendsProps = {
    className?: string;
    style?: React.CSSProperties;
    rotation?: number;
    speed?: number;
    colors?: string[];
    transparent?: boolean;
    autoRotate?: number;
    scale?: number;
    frequency?: number;
    warpStrength?: number;
    mouseInfluence?: number;
    parallax?: number;
    noise?: number;
};
export default function ColorBends({ className, style, rotation, speed, colors, transparent, autoRotate, scale, frequency, warpStrength, mouseInfluence, parallax, noise, }: ColorBendsProps): React.JSX.Element;
export {};
