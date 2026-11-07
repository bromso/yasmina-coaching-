import type React from "react";
export interface TargetCursorProps {
    targetSelector?: string;
    spinDuration?: number;
    hideDefaultCursor?: boolean;
    hoverDuration?: number;
    parallaxOn?: boolean;
}
declare const TargetCursor: React.FC<TargetCursorProps>;
export default TargetCursor;
