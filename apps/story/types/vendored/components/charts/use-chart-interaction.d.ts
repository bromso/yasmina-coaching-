import type { scaleLinear, scaleTime } from "@visx/scale";
import type { LineConfig, Margin, TooltipData } from "./chart-context";
type ScaleTime = ReturnType<typeof scaleTime<number>>;
type ScaleLinear = ReturnType<typeof scaleLinear<number>>;
export interface ChartSelection {
    startX: number;
    endX: number;
    startIndex: number;
    endIndex: number;
    active: boolean;
}
interface UseChartInteractionParams {
    xScale: ScaleTime;
    yScale: ScaleLinear;
    yScales: Record<string, ScaleLinear>;
    data: Record<string, unknown>[];
    lines: LineConfig[];
    margin: Margin;
    xAccessor: (d: Record<string, unknown>) => Date;
    bisectDate: (data: Record<string, unknown>[], date: Date, lo: number) => number;
    canInteract: boolean;
}
interface ChartInteractionResult {
    tooltipData: TooltipData | null;
    setTooltipData: React.Dispatch<React.SetStateAction<TooltipData | null>>;
    selection: ChartSelection | null;
    clearSelection: () => void;
    interactionHandlers: {
        onMouseMove?: (event: React.MouseEvent<SVGGElement>) => void;
        onMouseLeave?: () => void;
        onMouseDown?: (event: React.MouseEvent<SVGGElement>) => void;
        onMouseUp?: () => void;
        onTouchStart?: (event: React.TouchEvent<SVGGElement>) => void;
        onTouchMove?: (event: React.TouchEvent<SVGGElement>) => void;
        onTouchEnd?: () => void;
    };
    interactionStyle: React.CSSProperties;
}
export declare function useChartInteraction({ xScale, yScale, yScales, data, lines, margin, xAccessor, bisectDate, canInteract, }: UseChartInteractionParams): ChartInteractionResult;
export {};
