import { type RefObject } from "react";
export declare function findPathLengthAtX(path: SVGPathElement | null, pathLength: number, targetX: number): number;
interface PathStrokeMetrics {
    pathD: string | null;
    pathLength: number;
}
/**
 * Caller passes the references that drive the rendered path (renderData,
 * innerWidth, etc.) as `deps`. A stringified summary like
 * `${renderData.length}:${innerWidth}` is *not* safe here — same-length
 * in-place mutations of `renderData` keep the summary identical, so the
 * effect would never re-fire and `pathD`/`pathLength` would stay frozen on
 * the previous geometry (the area fill repaints from `renderData` directly
 * and would diverge from the stroke).
 */
export declare function usePathStrokeMetrics(pathRef: RefObject<SVGPathElement | null>, deps: readonly unknown[]): PathStrokeMetrics;
export declare function resolveDashTailBounds(dashFromIndex: number | undefined, dataLength: number): boolean;
export declare function resolveDashStartX(data: Record<string, unknown>[], dashFromIndex: number, xScale: (value: Date | number) => number | undefined, xAccessor: (datum: Record<string, unknown>) => Date | number): number;
export {};
