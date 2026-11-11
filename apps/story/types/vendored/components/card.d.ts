import type * as React from "react";
type CardProps<T extends React.ElementType = "article"> = {
    as?: T;
    /**
     * `default` has www's rounded-4xl corners. `compact` is for dense screens (admin stat tiles,
     * tables, list rows): the same padding and gaps, with a tighter radius that a short card or a
     * full-width table row does not turn into a stadium.
     */
    size?: "default" | "compact";
    className?: string;
} & Omit<React.ComponentPropsWithoutRef<T>, "as" | "className" | "size">;
declare function Card<T extends React.ElementType = "article">({ as, size, className, ...props }: CardProps<T>): React.JSX.Element;
declare function CardHeader({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function CardTitle({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function CardDescription({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function CardAction({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function CardContent({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function CardFooter({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
export { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
