import type React from "react";
interface ParticlesProps {
    particleCount?: number;
    particleSpread?: number;
    speed?: number;
    particleColors?: string[];
    moveParticlesOnHover?: boolean;
    particleHoverFactor?: number;
    alphaParticles?: boolean;
    particleBaseSize?: number;
    sizeRandomness?: number;
    cameraDistance?: number;
    disableRotation?: boolean;
    pixelRatio?: number;
    className?: string;
}
declare const Particles: React.FC<ParticlesProps>;
export default Particles;
