import type React from "react";
interface PlasmaProps {
    color?: string;
    speed?: number;
    direction?: "forward" | "reverse" | "pingpong";
    scale?: number;
    opacity?: number;
    mouseInteractive?: boolean;
}
export declare const Plasma: React.FC<PlasmaProps>;
export default Plasma;
