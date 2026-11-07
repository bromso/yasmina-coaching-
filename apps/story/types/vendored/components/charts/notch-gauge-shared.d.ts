import { type ReactElement, type ReactNode } from "react";
export declare const DEFAULT_ACTIVE_GRADIENT: readonly [string, string];
export declare const DEFAULT_ACTIVE_FILL_OPACITY = 1;
export declare const DEFAULT_INACTIVE_FILL_OPACITY = 0.8;
export declare const DEFAULT_LINEAR_GAUGE_HEIGHT = 24;
export interface NotchPoint {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    x3: number;
    y3: number;
    x4: number;
    y4: number;
}
export interface ComputedNotch {
    index: number;
    points: NotchPoint;
    isActive: boolean;
    gradientColor: string;
    xCenter: number;
    yCenter: number;
}
export declare function collectGaugeDefsElements(nodes: ReactNode): ReactElement[];
export declare function interpolateGaugeHex(color1: string, color2: string, factor: number): string;
export declare function createNotchPath(points: NotchPoint, cornerRadiusPx: number, verticalDepth: number): string;
export declare function resolveGaugeBgFill(options: {
    notchIndex: number;
    totalNotches: number;
    hasCustomInactive: boolean;
    inactiveFill?: string;
    useThemePaletteGradient: boolean;
    useGradient: boolean;
    inactiveGrad0: string;
    inactiveGrad1: string;
    arcTrackFill: string;
    linearTrackFill: string;
    linearMode: boolean;
}): string;
export declare function resolveGaugeActiveFill(options: {
    notch: ComputedNotch;
    hasCustomActive: boolean;
    activeFill?: string;
    useThemePaletteGradient: boolean;
    themeActiveGradientId: string;
    useGradient: boolean;
    activeFillSolid: string;
}): string;
