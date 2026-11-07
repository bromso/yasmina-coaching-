import { type ScrollingNumberContainerProps as ScrollingNumberContainerPrimitiveProps } from "@repo/ui/components/animate-ui/primitives/texts/scrolling-number";
import * as React from "react";
type GitHubStarsWheelProps = {
    username?: string;
    repo?: string;
    direction?: "btt" | "ttb";
    delay?: number;
    value?: number;
    step?: number;
} & Omit<ScrollingNumberContainerPrimitiveProps, "direction" | "number" | "step">;
declare function GitHubStarsWheel({ username, repo, direction, itemsSize, sideItemsCount, delay, step, value, className, ...props }: GitHubStarsWheelProps): false | React.JSX.Element;
export { GitHubStarsWheel, type GitHubStarsWheelProps };
