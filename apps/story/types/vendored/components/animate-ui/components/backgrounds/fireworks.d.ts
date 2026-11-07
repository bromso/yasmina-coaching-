import * as React from "react";
type FireworksBackgroundProps = Omit<React.ComponentProps<"div">, "color"> & {
    canvasProps?: React.ComponentProps<"canvas">;
    population?: number;
    color?: string | string[];
    fireworkSpeed?: {
        min: number;
        max: number;
    } | number;
    fireworkSize?: {
        min: number;
        max: number;
    } | number;
    particleSpeed?: {
        min: number;
        max: number;
    } | number;
    particleSize?: {
        min: number;
        max: number;
    } | number;
};
declare function FireworksBackground({ ref, className, canvasProps, population, color, fireworkSpeed, fireworkSize, particleSpeed, particleSize, ...props }: FireworksBackgroundProps): React.JSX.Element;
export { FireworksBackground, type FireworksBackgroundProps };
