import type { ScaleLinear, ScaleTime } from "d3-scale";
import type { LineConfig, Margin, TooltipData } from "./chart-context";
import type { ChartSelection } from "./use-chart-interaction";
type XScale = ScaleTime<number, number>;
type YScale = ScaleLinear<number, number>;
interface UseScatterChartInteractionParams {
    xScale: XScale;
    yScale: YScale;
    yScales: Record<string, YScale>;
    data: Record<string, unknown>[];
    lines: LineConfig[];
    margin: Margin;
    xAccessor: (d: Record<string, unknown>) => Date;
    bisectDate: (data: Record<string, unknown>[], date: Date, lo: number) => number;
    canInteract: boolean;
}
interface ScatterChartInteractionResult {
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
export declare function useScatterChartInteraction({ xScale, yScale, yScales, data, lines, margin, xAccessor, bisectDate, canInteract, }: UseScatterChartInteractionParams): ScatterChartInteractionResult;
export {};
