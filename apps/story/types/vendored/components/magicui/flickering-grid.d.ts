import type React from "react";
interface FlickeringGridProps extends React.HTMLAttributes<HTMLDivElement> {
    squareSize?: number;
    gridGap?: number;
    flickerChance?: number;
    color?: string;
    width?: number;
    height?: number;
    className?: string;
    maxOpacity?: number;
}
export declare const FlickeringGrid: React.FC<FlickeringGridProps>;
export {};
