import { type ReactNode } from "react";
export interface ReferenceAreaConfig {
    yAxisId: string;
    y1?: number;
    y2?: number;
    axisLabelColor?: string;
}
/** Collect {@link ReferenceArea} props from chart children for axis label styling. */
export declare function extractReferenceAreaConfigs(children: ReactNode): ReferenceAreaConfig[];
