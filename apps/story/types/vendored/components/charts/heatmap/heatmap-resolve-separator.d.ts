import type { ReactNode } from "react";
import type { HeatmapColumn } from "./heatmap-context";
import type { HeatmapSeparatorLayout, HeatmapSeparatorParsedConfig } from "./heatmap-utils";
/** Reads the first {@link HeatmapSeparator} child for separator config. */
export declare function resolveHeatmapSeparatorConfig(children: ReactNode, chartSeparators?: HeatmapSeparatorParsedConfig | null): HeatmapSeparatorParsedConfig | null;
/** Merges chart prop and child-derived config, then resolves column indices from data. */
export declare function resolveHeatmapSeparatorConfigWithData(children: ReactNode, columns: HeatmapColumn[], chartSeparators?: HeatmapSeparatorParsedConfig | null): HeatmapSeparatorLayout | null;
