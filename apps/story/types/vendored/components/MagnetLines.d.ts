import type React from "react";
import { type CSSProperties } from "react";
interface MagnetLinesProps {
    rows?: number;
    columns?: number;
    containerSize?: string;
    lineColor?: string;
    lineWidth?: string;
    lineHeight?: string;
    baseAngle?: number;
    className?: string;
    style?: CSSProperties;
}
declare const MagnetLines: React.FC<MagnetLinesProps>;
export default MagnetLines;
