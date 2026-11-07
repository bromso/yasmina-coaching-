import { type GithubStarsProps } from "@repo/ui/components/animate-ui/primitives/animate/github-stars";
import { type ButtonProps as ButtonPrimitiveProps } from "@repo/ui/components/animate-ui/primitives/buttons/button";
import { type VariantProps } from "class-variance-authority";
import type * as React from "react";
declare const buttonVariants: (props?: ({
    variant?: "default" | "outline" | "accent" | "ghost" | null | undefined;
    size?: "default" | "sm" | "lg" | null | undefined;
} & import("class-variance-authority/types").ClassProp) | undefined) => string;
type GitHubStarsButtonProps = Omit<ButtonPrimitiveProps & GithubStarsProps, "asChild" | "children"> & VariantProps<typeof buttonVariants>;
declare function GitHubStarsButton({ className, username, repo, value, delay, inView, inViewMargin, inViewOnce, variant, size, ...props }: GitHubStarsButtonProps): React.JSX.Element;
export { GitHubStarsButton, type GitHubStarsButtonProps };
