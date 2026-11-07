import type React from "react";
interface GrainientProps {
    timeSpeed?: number;
    colorBalance?: number;
    warpStrength?: number;
    warpFrequency?: number;
    warpSpeed?: number;
    warpAmplitude?: number;
    blendAngle?: number;
    blendSoftness?: number;
    rotationAmount?: number;
    noiseScale?: number;
    grainAmount?: number;
    grainScale?: number;
    grainAnimated?: boolean;
    contrast?: number;
    gamma?: number;
    saturation?: number;
    centerX?: number;
    centerY?: number;
    zoom?: number;
    color1?: string;
    color2?: string;
    color3?: string;
    className?: string;
}
declare const Grainient: React.FC<GrainientProps>;
export default Grainient;
