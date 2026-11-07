import type React from "react";
import { type HTMLAttributes } from "react";
interface WarpBackgroundProps extends HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
    perspective?: number;
    beamsPerSide?: number;
    beamSize?: number;
    beamDelayMax?: number;
    beamDelayMin?: number;
    beamDuration?: number;
    gridColor?: string;
}
export declare const WarpBackground: React.FC<WarpBackgroundProps>;
export {};
