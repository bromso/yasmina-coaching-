import type * as React from "react";
type CardProps<T extends React.ElementType = "article"> = {
    as?: T;
    className?: string;
} & Omit<React.ComponentPropsWithoutRef<T>, "as" | "className">;
declare function Card<T extends React.ElementType = "article">({ as, className, ...props }: CardProps<T>): React.JSX.Element;
declare function CardHeader({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function CardTitle({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function CardDescription({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function CardAction({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function CardContent({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function CardFooter({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
export { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
