interface FallingTextProps {
    text?: string;
    highlightWords?: string[];
    trigger?: "auto" | "scroll" | "click" | "hover";
    backgroundColor?: string;
    wireframes?: boolean;
    gravity?: number;
    mouseConstraintStiffness?: number;
    fontSize?: string;
}
declare const FallingText: React.FC<FallingTextProps>;
export default FallingText;
