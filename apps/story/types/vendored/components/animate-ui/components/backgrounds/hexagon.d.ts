import * as React from "react";
type HexagonBackgroundProps = React.ComponentProps<"div"> & {
    hexagonProps?: React.ComponentProps<"div">;
    hexagonSize?: number;
    hexagonMargin?: number;
};
declare function HexagonBackground({ className, children, hexagonProps, hexagonSize, hexagonMargin, ...props }: HexagonBackgroundProps): React.JSX.Element;
export { HexagonBackground, type HexagonBackgroundProps };
