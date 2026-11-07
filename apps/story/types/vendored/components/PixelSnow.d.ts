interface PixelSnowProps {
    color?: string;
    flakeSize?: number;
    minFlakeSize?: number;
    pixelResolution?: number;
    speed?: number;
    depthFade?: number;
    farPlane?: number;
    brightness?: number;
    gamma?: number;
    density?: number;
    variant?: "square" | "round" | "snowflake";
    direction?: number;
    className?: string;
    style?: React.CSSProperties;
}
export default function PixelSnow({ color, flakeSize, minFlakeSize, pixelResolution, speed, depthFade, farPlane, brightness, gamma, density, variant, direction, className, style, }: PixelSnowProps): import("react").JSX.Element;
export {};
