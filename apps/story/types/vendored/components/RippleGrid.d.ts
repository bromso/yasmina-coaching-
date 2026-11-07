type Props = {
    enableRainbow?: boolean;
    gridColor?: string;
    rippleIntensity?: number;
    gridSize?: number;
    gridThickness?: number;
    fadeDistance?: number;
    vignetteStrength?: number;
    glowIntensity?: number;
    opacity?: number;
    gridRotation?: number;
    mouseInteraction?: boolean;
    mouseInteractionRadius?: number;
};
declare const RippleGrid: React.FC<Props>;
export default RippleGrid;
