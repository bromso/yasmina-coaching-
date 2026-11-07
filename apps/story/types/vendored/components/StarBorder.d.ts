import type React from "react";
type StarBorderProps<T extends React.ElementType> = React.ComponentPropsWithoutRef<T> & {
    as?: T;
    className?: string;
    children?: React.ReactNode;
    color?: string;
    speed?: React.CSSProperties["animationDuration"];
    thickness?: number;
};
declare const StarBorder: <T extends React.ElementType = "button">({ as, className, color, speed, thickness, children, ...rest }: StarBorderProps<T>) => React.JSX.Element;
export default StarBorder;
