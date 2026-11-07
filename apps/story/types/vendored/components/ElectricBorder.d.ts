import type React from "react";
import { type CSSProperties, type ReactNode } from "react";
interface ElectricBorderProps {
    children?: ReactNode;
    color?: string;
    speed?: number;
    chaos?: number;
    borderRadius?: number;
    className?: string;
    style?: CSSProperties;
}
declare const ElectricBorder: React.FC<ElectricBorderProps>;
export default ElectricBorder;
