import type React from "react";
interface AntigravityProps {
    count?: number;
    magnetRadius?: number;
    ringRadius?: number;
    waveSpeed?: number;
    waveAmplitude?: number;
    particleSize?: number;
    lerpSpeed?: number;
    color?: string;
    autoAnimate?: boolean;
    particleVariance?: number;
    rotationSpeed?: number;
    depthFactor?: number;
    pulseSpeed?: number;
    particleShape?: "capsule" | "sphere" | "box" | "tetrahedron";
    fieldStrength?: number;
}
declare const Antigravity: React.FC<AntigravityProps>;
export default Antigravity;
