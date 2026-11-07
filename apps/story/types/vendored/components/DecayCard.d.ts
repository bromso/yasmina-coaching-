import type React from "react";
import { type ReactNode } from "react";
interface DecayCardProps {
    width?: number;
    height?: number;
    image?: string;
    children?: ReactNode;
}
declare const DecayCard: React.FC<DecayCardProps>;
export default DecayCard;
