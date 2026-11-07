import type { FeatureCollection, Geometry } from "geojson";
import { type ReactNode } from "react";
interface CountryProperties {
    name: string;
    [key: string]: unknown;
}
interface WorldDataContextValue {
    worldData: FeatureCollection<Geometry, CountryProperties> | null;
    isLoading: boolean;
}
export declare function WorldDataProvider({ children }: {
    children: ReactNode;
}): import("react").JSX.Element;
export declare function useWorldData(): WorldDataContextValue;
export declare function useWorldDataStandalone(): {
    worldData: FeatureCollection<Geometry, CountryProperties> | null;
    isLoading: boolean;
};
export {};
