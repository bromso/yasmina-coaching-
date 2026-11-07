import React from "react";
export interface OrbitingCirclesProps extends React.HTMLAttributes<HTMLDivElement> {
    className?: string;
    children?: React.ReactNode;
    reverse?: boolean;
    duration?: number;
    delay?: number;
    radius?: number;
    path?: boolean;
    iconSize?: number;
    speed?: number;
}
export declare function OrbitingCircles({ className, children, reverse, duration, radius, path, iconSize, speed, ...props }: OrbitingCirclesProps): React.JSX.Element;
