import type React from "react";
export interface LiquidEtherProps {
    mouseForce?: number;
    cursorSize?: number;
    isViscous?: boolean;
    viscous?: number;
    iterationsViscous?: number;
    iterationsPoisson?: number;
    dt?: number;
    BFECC?: boolean;
    resolution?: number;
    isBounce?: boolean;
    colors?: string[];
    style?: React.CSSProperties;
    className?: string;
    autoDemo?: boolean;
    autoSpeed?: number;
    autoIntensity?: number;
    takeoverDuration?: number;
    autoResumeDelay?: number;
    autoRampDuration?: number;
}
export default function LiquidEther({ mouseForce, cursorSize, isViscous, viscous, iterationsViscous, iterationsPoisson, dt, BFECC, resolution, isBounce, colors, style, className, autoDemo, autoSpeed, autoIntensity, takeoverDuration, autoResumeDelay, autoRampDuration, }: LiquidEtherProps): React.ReactElement;
