import type React from "react";
interface LightPillarProps {
    topColor?: string;
    bottomColor?: string;
    intensity?: number;
    rotationSpeed?: number;
    interactive?: boolean;
    className?: string;
    glowAmount?: number;
    pillarWidth?: number;
    pillarHeight?: number;
    noiseIntensity?: number;
    mixBlendMode?: React.CSSProperties["mixBlendMode"];
    pillarRotation?: number;
    quality?: "low" | "medium" | "high";
}
declare const LightPillar: React.FC<LightPillarProps>;
export default LightPillar;
