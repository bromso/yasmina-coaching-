import { type Transition } from "motion/react";
import * as React from "react";
type ImageZoomProps = {
    zoomScale?: number;
    transition?: Transition;
    style?: React.CSSProperties;
    zoomOnClick?: boolean;
    zoomOnHover?: boolean;
    disabled?: boolean;
    width?: React.CSSProperties["width"];
    height?: React.CSSProperties["height"];
    children: React.ReactElement;
} & React.ComponentProps<"div">;
export declare function ImageZoom({ children, zoomScale, transition, style, zoomOnClick, zoomOnHover, disabled, width, height, ...props }: ImageZoomProps): React.JSX.Element;
type ImageProps<T extends React.ElementType = "img"> = {
    objectFit?: React.CSSProperties["objectFit"];
    as?: T;
} & React.ComponentProps<T>;
export declare function Image<T extends React.ElementType = "img">({ objectFit, as: Component, ...props }: ImageProps<T>): React.JSX.Element;
export {};
