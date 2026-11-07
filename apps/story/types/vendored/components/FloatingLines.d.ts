type WavePosition = {
    x: number;
    y: number;
    rotate: number;
};
type FloatingLinesProps = {
    linesGradient?: string[];
    enabledWaves?: Array<"top" | "middle" | "bottom">;
    lineCount?: number | number[];
    lineDistance?: number | number[];
    topWavePosition?: WavePosition;
    middleWavePosition?: WavePosition;
    bottomWavePosition?: WavePosition;
    animationSpeed?: number;
    interactive?: boolean;
    bendRadius?: number;
    bendStrength?: number;
    mouseDamping?: number;
    parallax?: boolean;
    parallaxStrength?: number;
    mixBlendMode?: React.CSSProperties["mixBlendMode"];
};
export default function FloatingLines({ linesGradient, enabledWaves, lineCount, lineDistance, topWavePosition, middleWavePosition, bottomWavePosition, animationSpeed, interactive, bendRadius, bendStrength, mouseDamping, parallax, parallaxStrength, mixBlendMode, }: FloatingLinesProps): import("react").JSX.Element;
export {};
