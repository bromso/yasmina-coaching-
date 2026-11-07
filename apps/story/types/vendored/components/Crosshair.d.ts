import type React from "react";
import { type RefObject } from "react";
interface CrosshairProps {
    color?: string;
    containerRef?: RefObject<HTMLElement>;
}
declare const Crosshair: React.FC<CrosshairProps>;
export default Crosshair;
