import type { FC } from "react";
interface GlitchTextProps {
    children: string;
    speed?: number;
    enableShadows?: boolean;
    enableOnHover?: boolean;
    className?: string;
}
declare const GlitchText: FC<GlitchTextProps>;
export default GlitchText;
