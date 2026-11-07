interface StackProps {
    randomRotation?: boolean;
    sensitivity?: number;
    sendToBackOnClick?: boolean;
    cards?: React.ReactNode[];
    animationConfig?: {
        stiffness: number;
        damping: number;
    };
    autoplay?: boolean;
    autoplayDelay?: number;
    pauseOnHover?: boolean;
    mobileClickOnly?: boolean;
    mobileBreakpoint?: number;
}
export default function Stack({ randomRotation, sensitivity, cards, animationConfig, sendToBackOnClick, autoplay, autoplayDelay, pauseOnHover, mobileClickOnly, mobileBreakpoint, }: StackProps): import("react").JSX.Element;
export {};
