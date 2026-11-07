import * as React from "react";
type MouseGravity = "attract" | "repel";
type GlowAnimation = "instant" | "ease" | "spring";
type StarsInteractionType = "bounce" | "merge";
type GravityStarsProps = {
    starsCount?: number;
    starsSize?: number;
    starsOpacity?: number;
    glowIntensity?: number;
    glowAnimation?: GlowAnimation;
    movementSpeed?: number;
    mouseInfluence?: number;
    mouseGravity?: MouseGravity;
    gravityStrength?: number;
    starsInteraction?: boolean;
    starsInteractionType?: StarsInteractionType;
} & React.ComponentProps<"div">;
declare function GravityStarsBackground({ starsCount, starsSize, starsOpacity, glowIntensity, glowAnimation, movementSpeed, mouseInfluence, mouseGravity, gravityStrength, starsInteraction, starsInteractionType, className, ...props }: GravityStarsProps): React.JSX.Element;
export { GravityStarsBackground, type GravityStarsProps };
