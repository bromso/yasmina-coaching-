interface MetallicPaintProps {
    imageSrc: string;
    seed?: number;
    scale?: number;
    refraction?: number;
    blur?: number;
    liquid?: number;
    speed?: number;
    brightness?: number;
    contrast?: number;
    angle?: number;
    fresnel?: number;
    lightColor?: string;
    darkColor?: string;
    patternSharpness?: number;
    waveAmplitude?: number;
    noiseScale?: number;
    chromaticSpread?: number;
    mouseAnimation?: boolean;
    distortion?: number;
    contour?: number;
    tintColor?: string;
}
export default function MetallicPaint({ imageSrc, seed, scale, refraction, blur, liquid, speed, brightness, contrast, angle, fresnel, lightColor, darkColor, patternSharpness, waveAmplitude, noiseScale, chromaticSpread, mouseAnimation, distortion, contour, tintColor, }: MetallicPaintProps): import("react").JSX.Element;
export {};
