interface TrueFocusProps {
    sentence?: string;
    separator?: string;
    manualMode?: boolean;
    blurAmount?: number;
    borderColor?: string;
    glowColor?: string;
    animationDuration?: number;
    pauseBetweenAnimations?: number;
}
declare const TrueFocus: React.FC<TrueFocusProps>;
export default TrueFocus;
