import { type FadeEdges } from "./fade-edges";
interface AreaGradientDefsProps {
    gradientId: string;
    strokeGradientId: string;
    edgeMaskId: string;
    edgeGradientId: string;
    fill: string;
    fillOpacity: number;
    gradientToOpacity: number;
    /** 0–1: where the bottom stop sits (1 = full-height gradient). */
    gradientSpan?: number;
    resolvedStroke: string;
    isPatternFill: boolean;
    fadeEdges: FadeEdges;
    innerWidth: number;
    innerHeight: number;
}
export declare function AreaGradientDefs({ gradientId, strokeGradientId, edgeMaskId, edgeGradientId, fill, fillOpacity, gradientToOpacity, gradientSpan, resolvedStroke, isPatternFill, fadeEdges, innerWidth, innerHeight, }: AreaGradientDefsProps): import("react").JSX.Element;
export {};
