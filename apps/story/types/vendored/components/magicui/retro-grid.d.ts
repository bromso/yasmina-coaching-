interface RetroGridProps extends React.HTMLAttributes<HTMLDivElement> {
    /**
     * Additional CSS classes to apply to the grid container
     */
    className?: string;
    /**
     * Rotation angle of the grid in degrees
     * @default 65
     */
    angle?: number;
    /**
     * Grid cell size in pixels
     * @default 60
     */
    cellSize?: number;
    /**
     * Grid opacity value between 0 and 1
     * @default 0.5
     */
    opacity?: number;
    /**
     * Grid line color in light mode
     * @default "gray"
     */
    lightLineColor?: string;
    /**
     * Grid line color in dark mode
     * @default "gray"
     */
    darkLineColor?: string;
}
export declare function RetroGrid({ className, angle, cellSize, opacity, lightLineColor, darkLineColor, ...props }: RetroGridProps): import("react").JSX.Element;
export {};
