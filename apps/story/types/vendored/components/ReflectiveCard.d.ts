import type React from "react";
interface ReflectiveCardProps {
    blurStrength?: number;
    color?: string;
    metalness?: number;
    roughness?: number;
    overlayColor?: string;
    displacementStrength?: number;
    noiseScale?: number;
    specularConstant?: number;
    grayscale?: number;
    glassDistortion?: number;
    className?: string;
    style?: React.CSSProperties;
}
declare const ReflectiveCard: React.FC<ReflectiveCardProps>;
export default ReflectiveCard;
