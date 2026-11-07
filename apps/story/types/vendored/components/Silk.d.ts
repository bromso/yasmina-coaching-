import type React from "react";
export interface SilkProps {
    speed?: number;
    scale?: number;
    color?: string;
    noiseIntensity?: number;
    rotation?: number;
}
declare const Silk: React.FC<SilkProps>;
export default Silk;
