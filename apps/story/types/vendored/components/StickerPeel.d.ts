interface StickerPeelProps {
    imageSrc: string;
    rotate?: number;
    peelBackHoverPct?: number;
    peelBackActivePct?: number;
    peelEasing?: string;
    peelHoverEasing?: string;
    width?: number;
    shadowIntensity?: number;
    lightingIntensity?: number;
    initialPosition?: "center" | "random" | {
        x: number;
        y: number;
    };
    peelDirection?: number;
    className?: string;
}
declare const StickerPeel: React.FC<StickerPeelProps>;
export default StickerPeel;
