import { type WithAsChild } from "@repo/ui/components/animate-ui/primitives/animate/slot";
import { type HTMLMotionProps, type SpringOptions } from "motion/react";
import * as React from "react";
type CursorContextType = {
    cursorPos: {
        x: number;
        y: number;
    };
    active: boolean;
    global: boolean;
    containerRef: React.RefObject<HTMLDivElement | null>;
    cursorRef: React.RefObject<HTMLDivElement | null>;
};
declare const useCursor: () => CursorContextType;
type CursorProviderProps = {
    children: React.ReactNode;
    global?: boolean;
};
declare function CursorProvider({ children, global }: CursorProviderProps): React.JSX.Element;
type CursorContainerProps = WithAsChild<HTMLMotionProps<"div">>;
declare function CursorContainer({ ref, asChild, ...props }: CursorContainerProps): React.JSX.Element;
type CursorProps = WithAsChild<HTMLMotionProps<"div"> & {
    children: React.ReactNode;
}>;
declare function Cursor({ ref, asChild, style, ...props }: CursorProps): React.JSX.Element;
type CursorFollowSide = "top" | "right" | "bottom" | "left";
type CursorFollowAlign = "start" | "center" | "end";
type CursorFollowProps = WithAsChild<Omit<HTMLMotionProps<"div">, "transition"> & {
    side?: CursorFollowSide;
    sideOffset?: number;
    align?: CursorFollowAlign;
    alignOffset?: number;
    transition?: SpringOptions;
    children: React.ReactNode;
}>;
declare function CursorFollow({ ref, asChild, side, sideOffset, align, alignOffset, style, transition, ...props }: CursorFollowProps): React.JSX.Element;
export { Cursor, CursorContainer, type CursorContainerProps, type CursorContextType, CursorFollow, type CursorFollowAlign, type CursorFollowProps, type CursorFollowSide, type CursorProps, CursorProvider, type CursorProviderProps, useCursor, };
