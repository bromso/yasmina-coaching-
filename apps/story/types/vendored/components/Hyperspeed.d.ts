import { type FC } from "react";
import * as THREE from "three";
interface Distortion {
    uniforms: Record<string, {
        value: any;
    }>;
    getDistortion: string;
    getJS?: (progress: number, time: number) => THREE.Vector3;
}
interface Colors {
    roadColor: number;
    islandColor: number;
    background: number;
    shoulderLines: number;
    brokenLines: number;
    leftCars: number[];
    rightCars: number[];
    sticks: number;
}
interface HyperspeedOptions {
    onSpeedUp?: (ev: MouseEvent | TouchEvent) => void;
    onSlowDown?: (ev: MouseEvent | TouchEvent) => void;
    distortion?: string | Distortion;
    length: number;
    roadWidth: number;
    islandWidth: number;
    lanesPerRoad: number;
    fov: number;
    fovSpeedUp: number;
    speedUp: number;
    carLightsFade: number;
    totalSideLightSticks: number;
    lightPairsPerRoadWay: number;
    shoulderLinesWidthPercentage: number;
    brokenLinesWidthPercentage: number;
    brokenLinesLengthPercentage: number;
    lightStickWidth: [number, number];
    lightStickHeight: [number, number];
    movingAwaySpeed: [number, number];
    movingCloserSpeed: [number, number];
    carLightsLength: [number, number];
    carLightsRadius: [number, number];
    carWidthPercentage: [number, number];
    carShiftX: [number, number];
    carFloorSeparation: [number, number];
    colors: Colors;
    isHyper?: boolean;
}
interface HyperspeedProps {
    effectOptions?: Partial<HyperspeedOptions>;
}
declare const Hyperspeed: FC<HyperspeedProps>;
export default Hyperspeed;
