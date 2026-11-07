import type React from "react";
import { type JSX } from "react";
export interface CarouselItem {
    title: string;
    description: string;
    id: number;
    icon: React.ReactNode;
}
export interface CarouselProps {
    items?: CarouselItem[];
    baseWidth?: number;
    autoplay?: boolean;
    autoplayDelay?: number;
    pauseOnHover?: boolean;
    loop?: boolean;
    round?: boolean;
}
export default function Carousel({ items, baseWidth, autoplay, autoplayDelay, pauseOnHover, loop, round, }: CarouselProps): JSX.Element;
