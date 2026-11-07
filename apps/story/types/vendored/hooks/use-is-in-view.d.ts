import { type UseInViewOptions } from "motion/react";
import * as React from "react";
interface UseIsInViewOptions {
    inView?: boolean;
    inViewOnce?: boolean;
    inViewMargin?: UseInViewOptions["margin"];
}
declare function useIsInView<T extends HTMLElement = HTMLElement>(ref: React.Ref<T>, options?: UseIsInViewOptions): {
    ref: React.RefObject<T | null>;
    isInView: boolean;
};
export { type UseIsInViewOptions, useIsInView };
