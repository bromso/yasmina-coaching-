import { type WithAsChild } from "@repo/ui/components/animate-ui/primitives/animate/slot";
import { type ParticlesEffectProps } from "@repo/ui/components/animate-ui/primitives/effects/particles";
import { type SlidingNumberProps } from "@repo/ui/components/animate-ui/primitives/texts/sliding-number";
import { type UseIsInViewOptions } from "@repo/ui/hooks/use-is-in-view";
import { type HTMLMotionProps } from "motion/react";
import * as React from "react";
type GithubStarsContextType = {
    stars: number;
    setStars: (stars: number) => void;
    currentStars: number;
    setCurrentStars: (stars: number) => void;
    isCompleted: boolean;
    isLoading: boolean;
};
declare const useGithubStars: () => GithubStarsContextType;
type GithubStarsProps = WithAsChild<{
    children: React.ReactNode;
    username?: string;
    repo?: string;
    value?: number;
    delay?: number;
} & UseIsInViewOptions & HTMLMotionProps<"div">>;
declare function GithubStars({ ref, children, username, repo, value, delay, inView, inViewMargin, inViewOnce, asChild, ...props }: GithubStarsProps): React.JSX.Element;
type GithubStarsNumberProps = Omit<SlidingNumberProps, "number" | "fromNumber">;
declare function GithubStarsNumber({ padStart, ...props }: GithubStarsNumberProps): React.JSX.Element;
type GithubStarsIconProps<T extends React.ElementType> = {
    icon: React.ReactElement<T>;
    color?: string;
    activeClassName?: string;
} & React.ComponentProps<T>;
declare function GithubStarsIcon<T extends React.ElementType>({ icon: Icon, color, activeClassName, className, ...props }: GithubStarsIconProps<T>): React.JSX.Element;
type GithubStarsParticlesProps = ParticlesEffectProps & {
    children: React.ReactElement;
    size?: number;
};
declare function GithubStarsParticles({ children, size, style, ...props }: GithubStarsParticlesProps): React.JSX.Element;
type GithubStarsLogoProps = React.SVGProps<SVGSVGElement>;
declare function GithubStarsLogo(props: GithubStarsLogoProps): React.JSX.Element;
export { GithubStars, type GithubStarsContextType, GithubStarsIcon, type GithubStarsIconProps, GithubStarsLogo, type GithubStarsLogoProps, GithubStarsNumber, type GithubStarsNumberProps, GithubStarsParticles, type GithubStarsParticlesProps, type GithubStarsProps, useGithubStars, };
