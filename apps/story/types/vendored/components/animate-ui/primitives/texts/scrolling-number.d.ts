import { type UseIsInViewOptions } from "@repo/ui/hooks/use-is-in-view";
import { type HTMLMotionProps } from "motion/react";
import * as React from "react";
type ScrollingNumberDirection = "ltr" | "rtl" | "ttb" | "btt";
type ScrollingNumberContextType = {
    number: number;
    step: number;
    itemsSize: number;
    sideItemsCount: number;
    displayedItemsCount: number;
    isInView: boolean;
    direction: ScrollingNumberDirection;
    isVertical: boolean;
    range: number[];
    onNumberChange?: (value: number) => void;
};
declare const useScrollingNumber: () => ScrollingNumberContextType;
type ScrollingNumberContainerProps = React.ComponentProps<"div"> & {
    number: number;
    step: number;
    itemsSize?: number;
    sideItemsCount?: number;
    direction?: ScrollingNumberDirection;
    onNumberChange?: (value: number) => void;
} & UseIsInViewOptions;
declare function ScrollingNumberContainer({ ref, number, step, itemsSize, sideItemsCount, direction, inView, inViewMargin, inViewOnce, onNumberChange, style, ...props }: ScrollingNumberContainerProps): React.JSX.Element;
type ScrollingNumberHighlightProps = React.ComponentProps<"div">;
declare function ScrollingNumberHighlight({ style, ...props }: ScrollingNumberHighlightProps): React.JSX.Element;
type ScrollingNumberProps = HTMLMotionProps<"div"> & {
    delay?: number;
    onCompleted?: () => void;
};
declare function ScrollingNumber({ transition, delay, onCompleted, style, ...props }: ScrollingNumberProps): React.JSX.Element;
type ScrollingNumberItemsProps = Omit<React.ComponentProps<"div">, "children">;
declare function ScrollingNumberItems({ style, ...props }: ScrollingNumberItemsProps): React.JSX.Element[];
export { ScrollingNumber, ScrollingNumberContainer, type ScrollingNumberContainerProps, type ScrollingNumberContextType, type ScrollingNumberDirection, ScrollingNumberHighlight, type ScrollingNumberHighlightProps, ScrollingNumberItems, type ScrollingNumberItemsProps, type ScrollingNumberProps, useScrollingNumber, };
