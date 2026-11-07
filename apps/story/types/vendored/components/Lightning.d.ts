import type React from "react";
interface LightningProps {
    hue?: number;
    xOffset?: number;
    speed?: number;
    intensity?: number;
    size?: number;
}
declare const Lightning: React.FC<LightningProps>;
export default Lightning;
