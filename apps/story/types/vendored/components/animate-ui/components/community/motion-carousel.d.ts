import type { EmblaOptionsType } from "embla-carousel";
import * as React from "react";
type PropType = {
    slides: number[];
    options?: EmblaOptionsType;
};
declare function MotionCarousel(props: PropType): React.JSX.Element;
export { MotionCarousel };
