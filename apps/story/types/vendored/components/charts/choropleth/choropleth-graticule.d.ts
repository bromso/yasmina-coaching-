export interface ChoroplethGraticuleProps {
    /** Stroke color for graticule lines. Default: rgba(255,255,255,0.1) */
    stroke?: string;
    /** Stroke width for graticule lines. Default: 0.5 */
    strokeWidth?: number;
    /** Step intervals for graticule lines [longitude, latitude] in degrees. Default: [10, 10] */
    step?: [number, number];
}
export declare const ChoroplethGraticule: import("react").NamedExoticComponent<ChoroplethGraticuleProps>;
export default ChoroplethGraticule;
