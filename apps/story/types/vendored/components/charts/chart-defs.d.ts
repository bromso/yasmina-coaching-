import { type ReactElement, type ReactNode } from "react";
export declare function getChartChildComponentName(child: ReactElement): string;
/** @visx/pattern default exports use short names (e.g. `Lines`); also match *Pattern* displayNames. */
export declare function isPatternDefComponent(child: ReactElement): boolean;
export declare function isGradientDefComponent(child: ReactElement): boolean;
export declare function isChartDefsComponent(child: ReactElement): boolean;
/** Split hoisted defs: @visx/pattern nodes already wrap `<defs>` and render at the svg root. */
export declare function partitionChartDefNodes(defNodes: ReactElement[]): {
    patternDefNodes: ReactElement[];
    gradientDefNodes: ReactElement[];
};
export declare function collectChartDefsChildren(children: ReactNode): ReactElement[];
