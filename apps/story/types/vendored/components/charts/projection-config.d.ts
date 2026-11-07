import { type ReactNode } from "react";
import type { ProjectionPoint } from "./projection-utils";
export interface ProjectionLineConfig {
    yAxisId: string;
    data: ProjectionPoint[];
}
/** Collect {@link ProjectionLine} props from chart children for domain extension. */
export declare function extractProjectionLineConfigs(children: ReactNode): ProjectionLineConfig[];
export declare function mergeProjectionYDomain(domain: [number, number], configs: ProjectionLineConfig[], yAxisId: string): [number, number];
export declare function mergeProjectionXDomainMax(maxTime: number, configs: ProjectionLineConfig[]): number;
