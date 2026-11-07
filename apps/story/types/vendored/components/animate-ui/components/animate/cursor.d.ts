import { type CursorContainerProps as CursorContainerPropsPrimitive, type CursorFollowProps as CursorFollowPropsPrimitive, type CursorProps as CursorPropsPrimitive, type CursorProviderProps as CursorProviderPropsPrimitive } from "@repo/ui/components/animate-ui/primitives/animate/cursor";
type CursorProviderProps = Omit<CursorProviderPropsPrimitive, "children"> & CursorContainerPropsPrimitive;
declare function CursorProvider({ global, ...props }: CursorProviderProps): import("react").JSX.Element;
type CursorProps = Omit<CursorPropsPrimitive, "children" | "asChild">;
declare function Cursor({ className, ...props }: CursorProps): import("react").JSX.Element;
type CursorFollowProps = Omit<CursorFollowPropsPrimitive, "asChild">;
declare function CursorFollow({ className, children, sideOffset, alignOffset, ...props }: CursorFollowProps): import("react").JSX.Element;
export { Cursor, CursorFollow, type CursorFollowProps, type CursorProps, CursorProvider, type CursorProviderProps, };
