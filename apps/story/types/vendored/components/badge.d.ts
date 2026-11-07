import { type VariantProps } from "class-variance-authority";
import type * as React from "react";
declare const badgeVariants: (props?: ({
    variant?: "default" | "outline" | "destructive" | "secondary" | null | undefined;
} & import("class-variance-authority/types").ClassProp) | undefined) => string;
declare function Badge({ className, variant, asChild, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & {
    asChild?: boolean;
}): React.JSX.Element;
export { Badge, badgeVariants };
