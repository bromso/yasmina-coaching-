export type RingLineCap = "round" | "butt";
export interface RingProps {
    index: number;
    color?: string;
    animate?: boolean;
    showGlow?: boolean;
    lineCap?: RingLineCap;
}
export declare const Ring: import("react").NamedExoticComponent<RingProps>;
export default Ring;
