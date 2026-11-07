import { type ChoroplethFeature as ChoroplethFeatureType } from "./choropleth-context";
export interface ChoroplethFeatureProps {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    fadedOpacity?: number;
    getFeatureColor?: (feature: ChoroplethFeatureType, index: number) => string;
    patterns?: React.ReactNode;
    getFeaturePattern?: (feature: ChoroplethFeatureType, index: number) => string | null | undefined;
}
export declare const ChoroplethFeature: import("react").NamedExoticComponent<ChoroplethFeatureProps>;
export default ChoroplethFeature;
