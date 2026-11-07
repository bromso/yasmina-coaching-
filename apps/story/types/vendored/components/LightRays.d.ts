export type RaysOrigin = "top-center" | "top-left" | "top-right" | "right" | "left" | "bottom-center" | "bottom-right" | "bottom-left";
interface LightRaysProps {
    raysOrigin?: RaysOrigin;
    raysColor?: string;
    raysSpeed?: number;
    lightSpread?: number;
    rayLength?: number;
    pulsating?: boolean;
    fadeDistance?: number;
    saturation?: number;
    followMouse?: boolean;
    mouseInfluence?: number;
    noiseAmount?: number;
    distortion?: number;
    className?: string;
}
declare const LightRays: React.FC<LightRaysProps>;
export default LightRays;
