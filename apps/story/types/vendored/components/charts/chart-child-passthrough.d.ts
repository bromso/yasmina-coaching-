import { type ReactElement, type ReactNode } from "react";
/** Marker on wrapper components whose single child should inherit clip classification. */
export declare const CHART_CLIP_PASSTHROUGH: "__chartClipPassthrough";
export declare function isChartClipPassthrough(type: unknown): boolean;
/** Unwrap visibility wrappers so `Grid` / axes stay outside the series clip. */
export declare function resolveChartChildElement(child: ReactElement): ReactElement;
/** Walk chart children, flattening React fragments (studio often groups layers in `<>...</>`). */
export declare function forEachChartChild(children: ReactNode, callback: (child: ReactElement, index: number) => void): void;
/** Markers render after the interaction overlay so they stay clickable. */
export declare function isPostOverlayComponent(child: ReactElement): boolean;
/** Renders above grid/axes but below series; excluded from grow-clip reveal. */
export declare function isUnderlayComponent(child: ReactElement): boolean;
/** Grid and axes stay visible during series clip reveal (e.g. loading → ready). */
export declare function isClipExcludedComponent(child: ReactElement): boolean;
/** SVG layer lists from chart shells need stable keys when rendered as arrays. */
export declare function renderKeyedChartLayers(children: ReactElement[]): ReactElement<unknown, string | import("react").JSXElementConstructor<any>>[];
