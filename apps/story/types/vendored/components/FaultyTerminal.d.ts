import type React from "react";
type Vec2 = [number, number];
export interface FaultyTerminalProps extends React.HTMLAttributes<HTMLDivElement> {
    scale?: number;
    gridMul?: Vec2;
    digitSize?: number;
    timeScale?: number;
    pause?: boolean;
    scanlineIntensity?: number;
    glitchAmount?: number;
    flickerAmount?: number;
    noiseAmp?: number;
    chromaticAberration?: number;
    dither?: number | boolean;
    curvature?: number;
    tint?: string;
    mouseReact?: boolean;
    mouseStrength?: number;
    dpr?: number;
    pageLoadAnimation?: boolean;
    brightness?: number;
}
export default function FaultyTerminal({ scale, gridMul, digitSize, timeScale, pause, scanlineIntensity, glitchAmount, flickerAmount, noiseAmp, chromaticAberration, dither, curvature, tint, mouseReact, mouseStrength, dpr, pageLoadAnimation, brightness, className, style, ...rest }: FaultyTerminalProps): React.JSX.Element;
export {};
