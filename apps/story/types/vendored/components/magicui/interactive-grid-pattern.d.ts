import type React from "react";
/**
 * InteractiveGridPattern is a component that renders a grid pattern with interactive squares.
 *
 * @param width - The width of each square.
 * @param height - The height of each square.
 * @param squares - The number of squares in the grid. The first element is the number of horizontal squares, and the second element is the number of vertical squares.
 * @param className - The class name of the grid.
 * @param squaresClassName - The class name of the squares.
 */
interface InteractiveGridPatternProps extends React.SVGProps<SVGSVGElement> {
    width?: number;
    height?: number;
    squares?: [number, number];
    className?: string;
    squaresClassName?: string;
}
/**
 * The InteractiveGridPattern component.
 *
 * @see InteractiveGridPatternProps for the props interface.
 * @returns A React component.
 */
export declare function InteractiveGridPattern({ width, height, squares, className, squaresClassName, ...props }: InteractiveGridPatternProps): React.JSX.Element;
export {};
